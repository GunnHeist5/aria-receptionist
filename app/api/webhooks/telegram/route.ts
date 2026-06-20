import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tg = require('../../../../sales-manager/lib/telegram');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { answerQuestion } = require('../../../../sales-manager/agents/trainer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeOffboarding } = require('../../../../sales-manager/workers/index');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chat: ownerChat } = require('../../../../sales-manager/lib/owner-chat');

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN ?? '';
const OWNER_ID   = process.env.TELEGRAM_OWNER_CHAT_ID ?? '';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('secret') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = await req.json();
  const pool   = getPool();

  // ── CALLBACK QUERY (approve/deny buttons) ─────────────────────────────────
  if (update.callback_query) {
    const cb   = update.callback_query;
    const data = cb.data as string;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callback_query_id: cb.id }),
    });

    const [action, type, id] = data.split(':');
    if (!action || !type || !id) return NextResponse.json({ ok: true });

    if (type === 'candidate') {
      if (action === 'approve') {
        const { rows: [candidate] } = await pool.query(
          `UPDATE candidates SET status='offered', updated_at=NOW() WHERE id=$1 RETURNING name, email`, [id]
        );
        await tg.sendToOwner(`✅ Offer approved for ${candidate?.name}. Send the PandaDoc contract to ${candidate?.email}.`);
      } else {
        await pool.query(`UPDATE candidates SET status='rejected', updated_at=NOW() WHERE id=$1`, [id]);
        await tg.sendToOwner(`Candidate archived.`);
      }
    }

    if (type === 'offboard') {
      if (action === 'approve') {
        const { rows: [proposal] } = await pool.query(
          `SELECT p.*, c.name, c.channel_id, c.id AS contractor_id
           FROM offboarding_proposals p JOIN contractors c ON c.id=p.contractor_id
           WHERE p.id=$1`, [id]
        );
        if (proposal) {
          await (executeOffboarding as Function)(proposal.id, { id: proposal.contractor_id, name: proposal.name, channel_id: proposal.channel_id }, proposal.proposed_message);
        }
      } else {
        await pool.query(`UPDATE offboarding_proposals SET status='denied', updated_at=NOW() WHERE id=$1`, [id]);
        await tg.sendToOwner(`Offboarding denied. Rep stays active.`);
      }
    }

    if (type === 'script') {
      if (action === 'approve') {
        const { rows: [proposal] } = await pool.query(
          `UPDATE script_proposals SET status='approved', approved_at=NOW() WHERE id=$1 RETURNING proposed_script_update`, [id]
        );
        if (proposal?.proposed_script_update) {
          // Push updated script to KB
          await pool.query(`
            UPDATE knowledge_base SET content=$1, updated_at=NOW()
            WHERE category='script' AND is_placeholder=false
            LIMIT 1
          `, [proposal.proposed_script_update]);
          // If only placeholder exists, update it too
          await pool.query(`
            UPDATE knowledge_base SET content=$1, is_placeholder=false, updated_at=NOW()
            WHERE category='script' AND id=(SELECT id FROM knowledge_base WHERE category='script' ORDER BY created_at LIMIT 1)
          `, [proposal.proposed_script_update]);

          // Notify all active reps
          const { rows: reps } = await pool.query(
            `SELECT channel_id, name FROM contractors WHERE active=true AND channel_id IS NOT NULL AND contract_signed_at IS NOT NULL`
          );
          for (const rep of reps) {
            await tg.send(rep.channel_id, `📢 Script update from your manager:\n\n${proposal.proposed_script_update.slice(0, 600)}${proposal.proposed_script_update.length > 600 ? '…' : ''}`);
          }
          await tg.sendToOwner(`✅ Script updated in KB and pushed to ${reps.length} rep(s).`);
        }
      } else {
        await pool.query(`UPDATE script_proposals SET status='denied' WHERE id=$1`, [id]);
        await tg.sendToOwner(`Script update skipped.`);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── REGULAR MESSAGE ────────────────────────────────────────────────────────
  if (update.message) {
    const msg    = update.message;
    const chatId = String(msg.chat.id);
    const text   = (msg.text ?? '').trim();
    if (!text) return NextResponse.json({ ok: true });

    // ── OWNER AI CHAT ──────────────────────────────────────────────────────
    if (chatId === OWNER_ID) {
      // /reps — quick rep status table
      if (text === '/reps') {
        const { rows } = await pool.query(`
          SELECT c.name, c.onboarding_step,
            (SELECT health_status FROM rep_metrics WHERE contractor_id=c.id ORDER BY computed_at DESC LIMIT 1) AS health,
            (SELECT total_dials FROM rep_metrics WHERE contractor_id=c.id AND period_type='week' ORDER BY computed_at DESC LIMIT 1) AS dials_7d
          FROM contractors c WHERE c.active=true ORDER BY c.created_at
        `);
        if (!rows.length) {
          await tg.sendToOwner('No active reps yet.');
        } else {
          const lines = rows.map(r => `• ${r.name} — ${r.health ?? 'no data'} | ${r.dials_7d ?? 0} dials (7d)`).join('\n');
          await tg.sendToOwner(`<b>Active Reps</b>\n\n${lines}`);
        }
        return NextResponse.json({ ok: true });
      }

      // /candidates — pipeline summary
      if (text === '/candidates') {
        const { rows } = await pool.query(
          `SELECT status, COUNT(*) AS n FROM candidates GROUP BY status ORDER BY n DESC`
        );
        const lines = rows.map(r => `${r.status}: ${r.n}`).join('\n');
        await tg.sendToOwner(`<b>Candidate Pipeline</b>\n\n${lines || 'empty'}`);
        return NextResponse.json({ ok: true });
      }

      // Conversational AI chat for everything else
      try {
        const reply = await ownerChat(pool, text);
        await tg.sendToOwner(reply);
      } catch (err: unknown) {
        const msg_ = err instanceof Error ? err.message : String(err);
        await tg.sendToOwner(`Error: ${msg_}`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── REP COMMANDS ───────────────────────────────────────────────────────
    const { rows: [rep] } = await pool.query(
      `SELECT * FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]
    );
    if (!rep) return NextResponse.json({ ok: true });

    // /log [dials] [connects] [demos] [closes]
    if (text.startsWith('/log')) {
      const parts = text.split(/\s+/);
      const [dials, connects, demos, closes] = parts.slice(1).map(Number);
      if (isNaN(dials)) {
        await tg.send(chatId, 'Usage: /log [dials] [connects] [demos] [closes]\nExample: /log 80 12 3 1');
        return NextResponse.json({ ok: true });
      }
      await pool.query(
        `INSERT INTO rep_activity (contractor_id, date, dials, connects, demos, closes)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
         ON CONFLICT (contractor_id, date) DO UPDATE SET
           dials    = rep_activity.dials    + EXCLUDED.dials,
           connects = rep_activity.connects + EXCLUDED.connects,
           demos    = rep_activity.demos    + EXCLUDED.demos,
           closes   = rep_activity.closes   + EXCLUDED.closes,
           updated_at = NOW()`,
        [rep.id, dials || 0, connects || 0, demos || 0, closes || 0]
      );
      await pool.query(`UPDATE contractors SET last_active_at=NOW() WHERE id=$1`, [rep.id]);
      await tg.send(chatId, `✅ Logged! Today: ${dials} dials, ${connects} connects, ${demos} demos, ${closes} closes. Keep pushing.`);
      return NextResponse.json({ ok: true });
    }

    // /stats
    if (text.startsWith('/stats')) {
      const { rows: [w] } = await pool.query(`
        SELECT COALESCE(SUM(dials),0) AS d, COALESCE(SUM(connects),0) AS c,
               COALESCE(SUM(demos),0) AS demos, COALESCE(SUM(closes),0) AS closes
        FROM rep_activity WHERE contractor_id=$1 AND date >= CURRENT_DATE - 7
      `, [rep.id]);
      const { rows: [earned] } = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM commissions WHERE contractor_id=$1 AND status='accrued'`, [rep.id]
      );
      await tg.send(chatId,
        `📊 Your last 7 days:\n${w.d} dials · ${w.c} connects · ${w.demos} demos · ${w.closes} closes\n\n💰 Unpaid commissions: $${Number(earned.total).toFixed(2)}`
      );
      return NextResponse.json({ ok: true });
    }

    // /objection [description of objection you heard]
    if (text.startsWith('/objection')) {
      const description = text.replace(/^\/objection\s*/i, '').trim();
      if (!description) {
        await tg.send(chatId, 'Usage: /objection [what they said]\nExample: /objection They said they already use an answering service');
        return NextResponse.json({ ok: true });
      }
      await pool.query(
        `INSERT INTO objections (contractor_id, description) VALUES ($1, $2)`,
        [rep.id, description]
      );
      await tg.send(chatId, `📝 Logged. I'll analyze patterns across the team weekly and update the script if a fix is clear.`);
      return NextResponse.json({ ok: true });
    }

    // Anything else → trainer Q&A
    const answer = await answerQuestion(pool, rep, text);
    await pool.query(
      `INSERT INTO coaching_sessions (contractor_id, trigger, contractor_reply, action_taken)
       VALUES ($1, 'inbound_message', $2, 'received')`,
      [rep.id, text]
    );
    await tg.send(chatId, answer);
  }

  return NextResponse.json({ ok: true });
}
