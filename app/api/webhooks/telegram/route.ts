import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendContractorAgreement } from '@/lib/pandadoc';
import { sendOnboardingBurst } from '@/lib/onboarding-burst';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tg          = require('../../../../sales-manager/lib/telegram');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { answerQuestion } = require('../../../../sales-manager/agents/trainer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeOffboarding } = require('../../../../sales-manager/workers/index');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chat: ownerChat } = require('../../../../sales-manager/lib/owner-chat');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cs = require('../../../../sales-manager/lib/call-session');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const OWNER_ID  = process.env.TELEGRAM_OWNER_CHAT_ID ?? '';

// ── Save a completed call session to DB ────────────────────────────────────
async function saveCall(pool: any, chatId: string, isOwner: boolean, contractorId: string | null, session: any, noteText?: string) {
  const note = noteText?.trim() || null;
  await pool.query(
    `INSERT INTO call_outcomes
       (contractor_id, is_owner, outcome, primary_objection, demo_method, notes, logged_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [contractorId, isOwner, session.outcome, session.primary_objection ?? null,
     session.demo_method ?? 'none', note]
  );
}

// ── /insights aggregation ──────────────────────────────────────────────────
async function buildInsights(pool: any, contractorId: string | null, isOwner: boolean): Promise<string> {
  const scope  = isOwner ? '' : 'AND contractor_id = $1';
  const params = isOwner ? [] : [contractorId];
  const offset = isOwner ? 0 : 1;

  const [totRow, outRows, objRows, demoRows, notesRows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM call_outcomes WHERE logged_at >= NOW() - INTERVAL '30 days' ${scope}`, params),
    pool.query(`SELECT outcome, COUNT(*) AS n FROM call_outcomes WHERE logged_at >= NOW() - INTERVAL '30 days' ${scope} GROUP BY outcome ORDER BY n DESC`, params),
    pool.query(`SELECT primary_objection, COUNT(*) AS n FROM call_outcomes WHERE logged_at >= NOW() - INTERVAL '30 days' AND primary_objection IS NOT NULL AND primary_objection != 'none' ${scope} GROUP BY primary_objection ORDER BY n DESC LIMIT 6`, params),
    pool.query(`SELECT demo_method, COUNT(*) AS total, COUNT(*) FILTER (WHERE outcome='closed') AS closes FROM call_outcomes WHERE logged_at >= NOW() - INTERVAL '30 days' ${scope} GROUP BY demo_method ORDER BY closes DESC`, params),
    pool.query(`SELECT notes FROM call_outcomes WHERE logged_at >= NOW() - INTERVAL '30 days' AND notes IS NOT NULL ${scope} ORDER BY logged_at DESC LIMIT 8`, params),
  ]);

  const total = Number(totRow.rows[0]?.n ?? 0);
  if (total === 0) return '📊 No calls logged yet. Use /call to start capturing.';

  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '—';
  const pad = (s: string, w: number) => s.padEnd(w);

  // Outcomes
  const outcomeMap: Record<string, number> = {};
  for (const r of outRows.rows) outcomeMap[r.outcome] = Number(r.n);
  const outcomeLabels: Record<string, string> = {
    closed: 'Closed', interested_followup: 'Interested', callback_scheduled: 'Callback',
    demo_given_no_close: 'Demo, no close', not_interested: 'Not interested', no_answer_voicemail: 'No answer',
  };
  const outcomeLines = Object.entries(outcomeLabels)
    .filter(([k]) => outcomeMap[k])
    .map(([k, label]) => `${pad(label, 18)} ${String(outcomeMap[k]).padStart(3)}  ${pct(outcomeMap[k])}`)
    .join('\n');

  // Objections
  const objLabels: Record<string, string> = {
    price: 'Price', setup_fee: 'Setup fee', dont_trust_ai: "Don't trust AI",
    too_busy: 'Too busy', already_have_solution: 'Have solution',
    not_decision_maker: 'Not DM', no_need: 'No need', other: 'Other',
  };
  const objLines = objRows.rows
    .map((r: any) => `${pad(objLabels[r.primary_objection] ?? r.primary_objection, 18)} ${String(r.n).padStart(3)}  ${pct(Number(r.n))}`)
    .join('\n') || '  (none logged yet)';

  // Demo method effect
  const demoLabels: Record<string, string> = {
    live_conference: 'Live/conference', recording: 'Recording',
    call_back_themselves: 'They call back', none: 'No demo',
  };
  const demoLines = demoRows.rows
    .map((r: any) => {
      const t = Number(r.total), c = Number(r.closes);
      const rate = t > 0 ? `${Math.round((c / t) * 100)}%` : '—';
      return `${pad(demoLabels[r.demo_method] ?? r.demo_method, 18)} ${String(t).padStart(3)} calls  ${String(c).padStart(2)} closed  (${rate})`;
    })
    .join('\n') || '  (none)';

  // Recent notes
  const noteLines = notesRows.rows
    .map((r: any) => `• ${r.notes.slice(0, 60)}`)
    .join('\n') || '  (none yet)';

  return `📊 <b>${total} calls logged — last 30 days</b>

<b>OUTCOMES</b>
<pre>${outcomeLines}</pre>

<b>TOP OBJECTIONS</b>
<pre>${objLines}</pre>

<b>DEMO METHOD vs CLOSE RATE</b>
<pre>${demoLines}</pre>

<b>RECENT NOTES</b>
${noteLines}`;
}

// ── Finalize a paused client with the number the owner bought ──────────────
async function finalizeClientNumber(pool: any, clientId: string, number: string): Promise<string> {
  const { rows: [c] } = await pool.query('SELECT id, business_name FROM clients WHERE id=$1', [clientId]);
  if (!c) return 'No client with that id.';
  await pool.query('UPDATE clients SET provisioned_number=$2 WHERE id=$1', [clientId, number]);

  // Load the pipeline + provider directly — the index.js wrappers call
  // require('dotenv'), which we avoid inside the Next.js runtime.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runPipeline } = require('../../../../onboarding/src/pipeline');
  const impl = (process.env.VOICE_PROVIDER || 'mock').toLowerCase().trim();
  const provider = impl === 'trillet'
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ? new (require('../../../../voice-provider/src/trillet.provider').TrilletVoiceProvider)()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    : new (require('../../../../voice-provider/src/mock.provider').MockVoiceProvider)();

  const { paused } = await runPipeline(clientId, { db: pool, provider });
  const { rows: [a] } = await pool.query('SELECT status, provisioned_number FROM clients WHERE id=$1', [clientId]);
  const first = c.business_name.split(' ')[0].toLowerCase();
  return paused
    ? `⏸ <b>${c.business_name}</b>: still paused — re-check the number/agent and try again.`
    : `✅ <b>${c.business_name}</b> finalized — <b>live</b>.\nNumber: <code>${a.provisioned_number}</code>\n\nText them their forwarding SMS, then reply <code>/activate ${first}</code> once they confirm.`;
}

/** Normalize a bare phone reply to E.164, or null if the text isn't clearly a number. */
function normNumber(text: string): string | null {
  const t = text.trim();
  if (!/^\+?[\d\s().\-]{7,}$/.test(t)) return null;
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+') && digits.length >= 7) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('secret') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = await req.json();
  const pool   = getPool();

  // ── CALLBACK QUERY ────────────────────────────────────────────────────────
  if (update.callback_query) {
    const cb     = update.callback_query;
    const data   = cb.data as string;
    const chatId = String(cb.from?.id ?? cb.message?.chat?.id ?? '');

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id }),
    });

    // Remove the inline keyboard from the original message so buttons can't be tapped twice
    const msgChatId  = cb.message?.chat?.id;
    const msgId      = cb.message?.message_id;
    if (msgChatId && msgId) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: msgChatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }),
      });
    }

    // ── Call flow callbacks ──────────────────────────────────────────────
    if (data.startsWith('call:')) {
      const [, field, value] = data.split(':');
      const session = cs.get(chatId);
      if (!session) return NextResponse.json({ ok: true });

      const isOwner = chatId === OWNER_ID;
      let contractorId: string | null = null;
      if (!isOwner) {
        const { rows: [rep] } = await pool.query(
          `SELECT id FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]
        );
        if (!rep) { cs.clear(chatId); return NextResponse.json({ ok: true }); }
        contractorId = rep.id;
      }

      if (field === 'outcome') {
        const next = { ...session, outcome: value };
        if (value === 'no_answer_voicemail') {
          cs.set(chatId, { ...next, step: 'note' });
          await tg.send(chatId, 'Optional note (or skip):', cs.noteKeyboard());
        } else {
          cs.set(chatId, { ...next, step: 'objection' });
          await tg.send(chatId, 'Main objection?', cs.objectionKeyboard());
        }
      } else if (field === 'objection') {
        cs.set(chatId, { ...session, primary_objection: value, step: 'demo' });
        await tg.send(chatId, 'Demo method?', cs.demoKeyboard());
      } else if (field === 'demo') {
        cs.set(chatId, { ...session, demo_method: value, step: 'note' });
        await tg.send(chatId, 'Optional: what worked / what failed / quote (one line):', cs.noteKeyboard());
      } else if (field === 'note' && value === 'skip') {
        await saveCall(pool, chatId, isOwner, contractorId, cs.get(chatId));
        cs.clear(chatId);
        await tg.send(chatId, '✅ Call logged.');
      }
      return NextResponse.json({ ok: true });
    }

    // ── Approve/deny callbacks ───────────────────────────────────────────
    const [action, type, id] = data.split(':');
    if (!action || !type || !id) return NextResponse.json({ ok: true });

    if (type === 'candidate') {
      if (action === 'approve') {
        const { rows: [c] } = await pool.query(
          `UPDATE candidates SET status='offered'
           WHERE id=$1 AND status NOT IN ('offered','rejected') RETURNING name, email`, [id]
        );
        if (!c) return NextResponse.json({ ok: true }); // already actioned — buttons already removed above

        // Auto-generate slug from name (e.g. "John Smith" → "johnsmith")
        const baseSlug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
        const { rows: [slugCheck] } = await pool.query(
          `SELECT COUNT(*) AS n FROM contractors WHERE slug LIKE $1`, [`${baseSlug}%`]
        );
        const slug = Number(slugCheck?.n) > 0 ? `${baseSlug}${Number(slugCheck.n) + 1}` : baseSlug;

        // Create contractor record
        const { rows: [contractor] } = await pool.query(
          `INSERT INTO contractors (name, email, slug, commission_setup, commission_residual_pct)
           VALUES ($1, $2, $3, 400, 10) RETURNING id`,
          [c.name, c.email, slug]
        );

        // Send PandaDoc contract (auto if API key configured, manual fallback if not)
        const result = await sendContractorAgreement({
          contractorId: contractor.id,
          name: c.name,
          email: c.email,
        });

        // Store the doc id so the worker can poll PandaDoc for the rep's signature.
        if (result.docId) {
          await pool.query(`UPDATE contractors SET contract_document_id=$2 WHERE id=$1`, [contractor.id, result.docId]);
        }

        // Telegram deep link — rep clicks this to connect their account
        const botUsername = process.env.TELEGRAM_BOT_USERNAME;
        const deepLink    = botUsername
          ? `https://t.me/${botUsername}?start=ctr_${contractor.id}`
          : null;
        const linkLine    = deepLink
          ? `\n📱 <b>Forward this link to them so they connect Telegram:</b>\n${deepLink}`
          : `\n⚠️ Set <code>TELEGRAM_BOT_USERNAME</code> in .env to auto-generate the Telegram link.`;

        if (result.sent) {
          await tg.sendToOwner(
            `✅ <b>${c.name}</b> approved.\n\n` +
            `Contract sent to ${c.email} via PandaDoc.\n` +
            `Slug: <code>${slug}</code>${linkLine}\n\n` +
            `Once they sign + click the Telegram link, onboarding fires automatically.`
          );
        } else {
          await tg.sendToOwner(
            `✅ <b>${c.name}</b> approved — contractor created (slug: <code>${slug}</code>).\n\n` +
            `⚠️ PandaDoc auto-send failed: ${result.error}\n` +
            `Send contract manually to <code>${c.email}</code> with metadata:\n` +
            `<code>contractor_id: ${contractor.id}</code>${linkLine}`
          );
        }
      } else {
        await pool.query(`UPDATE candidates SET status='rejected' WHERE id=$1`, [id]);
        await tg.sendToOwner('Candidate archived.');
      }
    }

    if (type === 'offboard') {
      if (action === 'approve') {
        const { rows: [p] } = await pool.query(
          `SELECT p.*, c.name, c.channel_id, c.id AS contractor_id
           FROM offboarding_proposals p JOIN contractors c ON c.id=p.contractor_id WHERE p.id=$1`, [id]
        );
        if (p) await (executeOffboarding as Function)(p.id, { id: p.contractor_id, name: p.name, channel_id: p.channel_id }, p.proposed_message);
      } else {
        await pool.query(`UPDATE offboarding_proposals SET status='denied', updated_at=NOW() WHERE id=$1`, [id]);
        await tg.sendToOwner('Offboarding denied.');
      }
    }

    if (type === 'script') {
      if (action === 'approve') {
        const { rows: [p] } = await pool.query(
          `UPDATE script_proposals SET status='approved', approved_at=NOW() WHERE id=$1 RETURNING proposed_script_update`, [id]
        );
        if (p?.proposed_script_update) {
          await pool.query(`UPDATE knowledge_base SET content=$1, is_placeholder=false, updated_at=NOW() WHERE category='script' AND id=(SELECT id FROM knowledge_base WHERE category='script' ORDER BY created_at LIMIT 1)`, [p.proposed_script_update]);
          const { rows: reps } = await pool.query(`SELECT channel_id FROM contractors WHERE active=true AND channel_id IS NOT NULL AND contract_signed_at IS NOT NULL`);
          for (const rep of reps) await tg.send(rep.channel_id, `📢 Script update:\n\n${p.proposed_script_update.slice(0, 600)}`);
          await tg.sendToOwner(`✅ Script updated and pushed to ${reps.length} rep(s).`);
        }
      } else {
        await pool.query(`UPDATE script_proposals SET status='denied' WHERE id=$1`, [id]);
        await tg.sendToOwner('Script update skipped.');
      }
    }

    // Owner approves onboarding AFTER the rep signs (fired from the PandaDoc webhook).
    if (type === 'onboard') {
      if (action === 'approve') {
        const { rows: [rep] } = await pool.query(
          `SELECT id, name, slug, channel_id, commission_setup, commission_residual_pct FROM contractors WHERE id=$1`, [id]
        );
        if (!rep) return NextResponse.json({ ok: true });
        if (rep.channel_id) {
          // Rep already connected Telegram → onboard immediately.
          await sendOnboardingBurst(rep);
          await pool.query(`UPDATE contractors SET onboarding_status='onboarded', onboarding_step=3, updated_at=NOW() WHERE id=$1`, [id]);
          await tg.sendToOwner(`✅ <b>${rep.name}</b> onboarded — full briefing sent on Telegram.`);
        } else {
          // Not connected yet → mark approved; /start fires the burst when they tap their link.
          await pool.query(`UPDATE contractors SET onboarding_status='onboarding_approved', updated_at=NOW() WHERE id=$1`, [id]);
          const bot = process.env.TELEGRAM_BOT_USERNAME;
          await tg.sendToOwner(
            `✅ <b>${rep.name}</b> approved. They haven't connected Telegram yet — they'll be onboarded automatically when they tap their link (it's in their contract email):\nhttps://t.me/${bot}?start=ctr_${id}`
          );
        }
      } else {
        await pool.query(`UPDATE contractors SET onboarding_status='onboarding_denied', updated_at=NOW() WHERE id=$1`, [id]);
        await tg.sendToOwner('Onboarding denied.');
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── MESSAGE ───────────────────────────────────────────────────────────────
  if (update.message) {
    const msg    = update.message;
    const chatId = String(msg.chat.id);
    const text   = (msg.text ?? '').trim();
    if (!text) return NextResponse.json({ ok: true });

    const isOwner = chatId === OWNER_ID;

    // ── Intercept active call session note step ────────────────────────
    // A slash-command while a note is pending means the rep abandoned the
    // note — clear the session and let the command run instead of eating it.
    const activeSession = cs.get(chatId);
    if (activeSession?.step === 'note' && text.startsWith('/')) {
      cs.clear(chatId);
    } else if (activeSession?.step === 'note') {
      let contractorId: string | null = null;
      if (!isOwner) {
        const { rows: [rep] } = await pool.query(`SELECT id FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]);
        contractorId = rep?.id ?? null;
      }
      await saveCall(pool, chatId, isOwner, contractorId, activeSession, text);
      cs.clear(chatId);
      await tg.send(chatId, '✅ Call logged.');
      return NextResponse.json({ ok: true });
    }

    // ── /start ctr_UUID — rep connecting their Telegram account ──────
    if (text.startsWith('/start ctr_')) {
      const contractorId = text.slice('/start ctr_'.length).trim();
      const { rows: [contractor] } = await pool.query(
        `UPDATE contractors SET channel_id=$1, updated_at=NOW()
         WHERE id=$2 AND channel_id IS NULL
         RETURNING id, name, slug, commission_setup, commission_residual_pct, contract_signed_at, onboarding_status`,
        [chatId, contractorId]
      );
      if (!contractor) {
        await tg.send(chatId, 'This link has already been used or is invalid. Contact your recruiter if you have an issue.');
        return NextResponse.json({ ok: true });
      }
      const firstName = contractor.name.split(' ')[0];
      if (contractor.onboarding_status === 'onboarding_approved') {
        // Owner already approved onboarding before the rep connected — fire it now.
        await sendOnboardingBurst({ ...contractor, channel_id: chatId });
        await pool.query(`UPDATE contractors SET onboarding_status='onboarded', onboarding_step=3, updated_at=NOW() WHERE id=$1`, [contractor.id]);
      } else if (contractor.contract_signed_at) {
        // Signed, but owner hasn't approved onboarding yet.
        await tg.send(chatId,
          `✅ Connected, ${firstName}! You're all set on our end — your full onboarding will land here as soon as we finalize. Hang tight.`
        );
      } else {
        await tg.send(chatId,
          `✅ Connected, ${firstName}!\n\n` +
          `Check your email for the contract. Once you sign it, you'll get your full onboarding — script, objection playbook, everything — right here.`
        );
      }
      return NextResponse.json({ ok: true });
    }

    // ── /help ─────────────────────────────────────────────────────────
    if (text === '/help') {
      const helpText = isOwner
        ? `<b>Owner commands</b>\n\n` +
          `<code>/call</code> — log a call outcome (3 taps)\n` +
          `<code>/demo [phone or name]</code> — make the demo line answer as a prospect's business\n` +
          `<code>/insights</code> — objection breakdown + demo close rates\n` +
          `<code>/reps</code> — active rep health status\n` +
          `<code>/candidates</code> — candidate pipeline\n` +
          `<code>/unactivated</code> — live clients still awaiting forwarding confirmation\n` +
          `<code>/number [clientId] [+number]</code> — finalize a client after buying its number\n` +
          `<code>/activate [name]</code> — mark client forwarding confirmed\n` +
          `<code>/log 80 12 3</code> — daily totals (dials/connects/demos)\n` +
          `<code>/stats</code> — your numbers\n` +
          `<code>/objection [text]</code> — log an objection\n\n` +
          `Or just ask me anything about the business.`
        : `<b>Your commands</b>\n\n` +
          `<code>/call</code> — log a connect (3 taps, ~15 sec)\n` +
          `<code>/demo [phone or name]</code> — demo line answers as THEIR business; have them call it\n` +
          `<code>/log 80 12 3</code> — end-of-day totals (dials/connects/demos)\n` +
          `<code>/stats</code> — your 7-day numbers + unpaid commissions\n` +
          `<code>/objection [what they said]</code> — log an objection\n` +
          `<code>/insights</code> — your call breakdown\n` +
          `<code>/help</code> — this list\n\n` +
          `Or just ask me any question about the product, pitch, or script.`;
      await tg.send(chatId, helpText);
      return NextResponse.json({ ok: true });
    }

    // ── /call — works for owner and reps ──────────────────────────────
    if (text === '/call') {
      cs.set(chatId, { step: 'outcome' });
      await tg.send(chatId, 'How did it go?', cs.outcomeKeyboard());
      return NextResponse.json({ ok: true });
    }

    // ── /insights — works for owner and reps ──────────────────────────
    if (text.startsWith('/insights')) {
      let contractorId: string | null = null;
      if (!isOwner) {
        const { rows: [rep] } = await pool.query(`SELECT id FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]);
        contractorId = rep?.id ?? null;
      }
      const report = await buildInsights(pool, contractorId, isOwner);
      await tg.send(chatId, report);
      return NextResponse.json({ ok: true });
    }

    // ── /demo — owner and ACTIVE reps only ─────────────────────────────
    // Re-skins the shared demo line to answer as a lead's business, so a
    // prospect can call and hear THEIR OWN receptionist. Auto-resets later.
    // Gated: it mutates provider state and surfaces lead contact info, and
    // Telegram bots are publicly messageable — never expose it to strangers.
    if (text.startsWith('/demo')) {
      if (!isOwner) {
        const { rows: [rep] } = await pool.query(
          `SELECT id FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]);
        if (!rep) return NextResponse.json({ ok: true }); // unknown chat: silently ignore
      }

      const arg = text.replace(/^\/demo\s*/i, '').trim();
      try {
        // Load pipeline modules directly (same reason as finalizeClientNumber:
        // avoid the dotenv-loading index.js wrappers inside the Next.js runtime).
        // Constructed INSIDE the try — the Trillet constructor throws if env is
        // missing, and that must become a chat reply, not a 500 Telegram retries.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const demoLine = require('../../../../onboarding/src/demo-line');
        const impl = (process.env.VOICE_PROVIDER || 'mock').toLowerCase().trim();
        const provider = impl === 'trillet'
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          ? new (require('../../../../voice-provider/src/trillet.provider').TrilletVoiceProvider)()
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          : new (require('../../../../voice-provider/src/mock.provider').MockVoiceProvider)();
        if (!arg) {
          await tg.send(chatId,
            `<b>Demo line</b> — make it answer as a prospect's business:\n` +
            `<code>/demo 9075630196</code> (their phone)\n` +
            `<code>/demo Cool Air Mechanical</code> (their name)\n` +
            `<code>/demo reset</code> — back to default\n\n` +
            `Then tell them: "Call <code>${demoLine.DEMO_NUMBER}</code> — that's YOUR receptionist answering."`);
          return NextResponse.json({ ok: true });
        }

        if (arg.toLowerCase() === 'reset') {
          const r = await demoLine.resetDemoLine(pool, provider);
          await tg.send(chatId, `✅ Demo line reset to <b>${r.businessName}</b>.`);
          return NextResponse.json({ ok: true });
        }

        // Find the lead: by phone if the arg looks like one, else by name.
        const asNumber = normNumber(arg);
        const { rows: matches } = asNumber
          ? await pool.query(
              `SELECT id, business_name, phone, city, state, website, business_type
               FROM clients WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 LIMIT 3`,
              [asNumber.replace(/\D/g, '').slice(-10)])
          : await pool.query(
              `SELECT id, business_name, phone, city, state, website, business_type
               FROM clients WHERE business_name ILIKE $1 ORDER BY (status='lead') DESC LIMIT 3`,
              [`%${arg}%`]);

        if (!matches.length) {
          await tg.send(chatId, `No lead found matching "<b>${arg}</b>". Try their phone number or a longer name fragment.`);
          return NextResponse.json({ ok: true });
        }
        if (matches.length > 1) {
          const lines = matches.map((m: any) => `• <b>${m.business_name}</b> (${m.city ?? '?'}, ${m.state ?? '?'}) — <code>/demo ${m.phone}</code>`).join('\n');
          await tg.send(chatId, `Found several — pick one:\n${lines}`);
          return NextResponse.json({ ok: true });
        }

        const r = await demoLine.applyDemoPack(pool, matches[0], provider);
        await tg.send(chatId,
          `✅ Demo line is now answering as <b>${r.businessName}</b>.\n\n` +
          `Tell the prospect (tap to copy):\n` +
          `<code>Call ${r.number} — that's YOUR receptionist answering for ${r.businessName}.</code>\n\n` +
          `Auto-resets in ~${r.resetMinutes} min. One prospect at a time — a new /demo replaces it.`);
      } catch (err: unknown) {
        await tg.send(chatId, `Demo line failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── OWNER chat ─────────────────────────────────────────────────────
    if (isOwner) {
      if (text === '/reps') {
        const { rows } = await pool.query(`
          SELECT c.name,
            (SELECT health_status FROM rep_metrics WHERE contractor_id=c.id ORDER BY computed_at DESC LIMIT 1) AS health,
            (SELECT total_dials FROM rep_metrics WHERE contractor_id=c.id AND period_type='week' ORDER BY computed_at DESC LIMIT 1) AS dials_7d
          FROM contractors c WHERE c.active=true ORDER BY c.created_at
        `);
        await tg.sendToOwner(rows.length
          ? `<b>Active Reps</b>\n\n${rows.map((r: any) => `• ${r.name} — ${r.health ?? 'no data'} | ${r.dials_7d ?? 0} dials (7d)`).join('\n')}`
          : 'No active reps yet.');
        return NextResponse.json({ ok: true });
      }

      if (text === '/candidates') {
        const { rows } = await pool.query(`SELECT status, COUNT(*) AS n FROM candidates GROUP BY status ORDER BY n DESC`);
        await tg.sendToOwner(`<b>Candidate Pipeline</b>\n\n${rows.map((r: any) => `${r.status}: ${r.n}`).join('\n') || 'empty'}`);
        return NextResponse.json({ ok: true });
      }

      if (text === '/unactivated') {
        const { rows } = await pool.query(`
          SELECT business_name, city, state, forward_to_number, carrier,
                 EXTRACT(DAY FROM NOW() - updated_at)::int AS days_live
          FROM clients
          WHERE status = 'live' AND forwarding_confirmed = false
          ORDER BY updated_at ASC
        `);
        if (!rows.length) {
          await tg.sendToOwner('✅ All live clients have confirmed forwarding.');
        } else {
          const lines = rows.map((r: any) =>
            `• <b>${r.business_name}</b> (${r.city}, ${r.state}) — day ${r.days_live ?? 0}\n  ${r.forward_to_number} · ${r.carrier || 'carrier unknown'}`
          ).join('\n');
          await tg.sendToOwner(`📋 <b>Live clients awaiting forwarding confirmation (${rows.length})</b>\n\n${lines}\n\nReply /activate [name] once they text back.`);
        }
        return NextResponse.json({ ok: true });
      }

      // Finalize a paused client after you've bought + attached its number in
      // the Trillet dashboard. Same logic as scripts/resume-provisioning.js.
      if (text.startsWith('/number')) {
        const parts    = text.trim().split(/\s+/);
        const clientId = parts[1];
        const number   = normNumber(parts.slice(2).join(' '));
        if (!clientId || !number) {
          await tg.sendToOwner('Usage: <code>/number CLIENT_ID +1XXXXXXXXXX</code>\n…or just reply with the number on its own and I\'ll apply it to the client awaiting finalization.');
          return NextResponse.json({ ok: true });
        }
        try { await tg.sendToOwner(await finalizeClientNumber(pool, clientId, number)); }
        catch (err: unknown) { await tg.sendToOwner(`Finalize failed: ${err instanceof Error ? err.message : String(err)}`); }
        return NextResponse.json({ ok: true });
      }

      if (text.startsWith('/activate ')) {
        const snippet = text.replace(/^\/activate\s+/i, '').trim().toLowerCase();
        if (!snippet) {
          await tg.sendToOwner('Usage: /activate [client name or phone]');
          return NextResponse.json({ ok: true });
        }
        // Fuzzy-match: name ILIKE or phone contains snippet
        const { rows } = await pool.query(`
          SELECT id, business_name FROM clients
          WHERE status = 'live'
            AND forwarding_confirmed = false
            AND (LOWER(business_name) LIKE $1 OR phone LIKE $2)
          ORDER BY updated_at DESC
          LIMIT 1
        `, [`%${snippet}%`, `%${snippet}%`]);
        if (!rows.length) {
          await tg.sendToOwner(`No unconfirmed live client matched "${snippet}". Try /unactivated to see the list.`);
        } else {
          const c = rows[0];
          await pool.query(
            `UPDATE clients SET forwarding_confirmed=true, forwarding_confirmed_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [c.id]
          );
          await tg.sendToOwner(`✅ <b>${c.business_name}</b> marked as forwarding confirmed. They're fully live!`);
        }
        return NextResponse.json({ ok: true });
      }

      // Bare number reply — finalize the client awaiting a number, no clientId needed.
      const bare = normNumber(text);
      if (bare) {
        try {
          const { rows: waiting } = await pool.query(
            `SELECT id, business_name FROM clients
             WHERE voice_provider_account_id IS NOT NULL AND provisioned_number IS NULL
               AND status NOT IN ('live','churned')
             ORDER BY updated_at DESC`
          );
          if (waiting.length === 0) {
            await tg.sendToOwner('No client is awaiting a number right now.\nTo finalize a specific one: <code>/number CLIENT_ID +1XXXXXXXXXX</code>');
          } else if (waiting.length === 1) {
            await tg.sendToOwner(await finalizeClientNumber(pool, waiting[0].id, bare));
          } else {
            const lines = waiting.map((c: any) => `• <b>${c.business_name}</b>\n  <code>/number ${c.id} ${bare}</code>`).join('\n');
            await tg.sendToOwner(`Several clients are awaiting numbers — tap the right one to copy + send:\n\n${lines}`);
          }
        } catch (err: unknown) {
          await tg.sendToOwner(`Finalize failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        return NextResponse.json({ ok: true });
      }

      try {
        const reply = await ownerChat(pool, text);
        await tg.sendToOwner(reply);
      } catch (err: unknown) {
        await tg.sendToOwner(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── REP commands ───────────────────────────────────────────────────
    const { rows: [rep] } = await pool.query(`SELECT * FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]);
    if (!rep) return NextResponse.json({ ok: true });

    if (text.startsWith('/log')) {
      const parts = text.split(/\s+/);
      const [dials, connects, demos] = parts.slice(1).map(Number);
      if (isNaN(dials)) {
        await tg.send(chatId, 'Usage: /log [dials] [connects] [demos]\nExample: /log 80 12 3');
        return NextResponse.json({ ok: true });
      }
      await pool.query(
        `INSERT INTO rep_activity (contractor_id, date, dials, connects, demos)
         VALUES ($1, CURRENT_DATE, $2, $3, $4)
         ON CONFLICT (contractor_id, date) DO UPDATE SET
           dials=$2+rep_activity.dials, connects=$3+rep_activity.connects,
           demos=$4+rep_activity.demos, updated_at=NOW()`,
        [rep.id, dials||0, connects||0, demos||0]
      );
      await pool.query(`UPDATE contractors SET last_active_at=NOW() WHERE id=$1`, [rep.id]);
      await tg.send(chatId, `✅ Logged! Today: ${dials} dials, ${connects} connects, ${demos} demos.`);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/stats')) {
      const { rows: [w] } = await pool.query(
        `SELECT COALESCE(SUM(dials),0) AS d, COALESCE(SUM(connects),0) AS c, COALESCE(SUM(demos),0) AS demos
         FROM rep_activity WHERE contractor_id=$1 AND date >= CURRENT_DATE - 7`,
        [rep.id]
      );
      const { rows: [cl] } = await pool.query(
        `SELECT COUNT(*) AS closes FROM commissions WHERE contractor_id=$1 AND type='setup' AND created_at >= NOW() - INTERVAL '7 days'`,
        [rep.id]
      );
      const { rows: [e] } = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM commissions WHERE contractor_id=$1 AND status='accrued'`,
        [rep.id]
      );
      await tg.send(chatId,
        `📊 Last 7 days:\n${w.d} dials · ${w.c} connects · ${w.demos} demos · ${cl.closes} closes ✓\n\n💰 Unpaid: $${Number(e.total).toFixed(2)}`
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/objection')) {
      const desc = text.replace(/^\/objection\s*/i, '').trim();
      if (!desc) {
        await tg.send(chatId, 'Usage: /objection [what they said]');
        return NextResponse.json({ ok: true });
      }
      await pool.query(`INSERT INTO objections (contractor_id, description) VALUES ($1, $2)`, [rep.id, desc]);
      await tg.send(chatId, '📝 Logged. I\'ll analyze patterns weekly.');
      return NextResponse.json({ ok: true });
    }

    // Trainer Q&A
    const answer = await answerQuestion(pool, rep, text);
    await pool.query(`INSERT INTO coaching_sessions (contractor_id, trigger, contractor_reply, action_taken) VALUES ($1, 'inbound_message', $2, 'received')`, [rep.id, text]);
    await tg.send(chatId, answer);
  }

  return NextResponse.json({ ok: true });
}
