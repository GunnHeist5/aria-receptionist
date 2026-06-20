import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
// These CJS modules are imported dynamically to avoid TS/ESM friction
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tg = require('../../../../sales-manager/lib/telegram');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { answerQuestion } = require('../../../../sales-manager/agents/trainer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeOffboarding } = require('../../../../sales-manager/workers/index');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

export async function POST(req: NextRequest) {
  // Verify it's from Telegram's webhook (token in URL set during registerWebhook)
  const { searchParams } = new URL(req.url);
  if (searchParams.get('secret') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = await req.json();
  const pool = getPool();

  // ── CALLBACK QUERY (approve/deny buttons) ──────────────────────────────────
  if (update.callback_query) {
    const cb   = update.callback_query;
    const data = cb.data as string; // e.g. "approve:candidate:uuid" or "deny:offboard:uuid"
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id }),
    });

    const [action, type, id] = data.split(':');
    if (!action || !type || !id) return NextResponse.json({ ok: true });

    if (type === 'candidate') {
      if (action === 'approve') {
        // Mark candidate as hired, send offer message
        const { rows: [candidate] } = await pool.query(
          `UPDATE candidates SET status='offered', updated_at=NOW() WHERE id=$1 RETURNING name, email, channel_id`, [id]
        );
        await tg.sendToOwner(`✅ Offer approved for ${candidate?.name}. You'll need to send the PandaDoc contract manually to ${candidate?.email}.`);
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

    return NextResponse.json({ ok: true });
  }

  // ── REGULAR MESSAGE (rep commands or questions) ───────────────────────────
  if (update.message) {
    const msg     = update.message;
    const chatId  = String(msg.chat.id);
    const text    = (msg.text ?? '').trim();

    // Identify rep by their Telegram chat ID
    const { rows: [rep] } = await pool.query(
      `SELECT * FROM contractors WHERE channel_id=$1 AND active=true LIMIT 1`, [chatId]
    );
    if (!rep) return NextResponse.json({ ok: true }); // unknown sender, ignore

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

    // Anything else → treat as a question for the trainer
    const answer = await answerQuestion(pool, rep, text);
    // Store contractor reply context back (for coaching history)
    await pool.query(
      `INSERT INTO coaching_sessions (contractor_id, trigger, contractor_reply, action_taken)
       VALUES ($1, 'inbound_message', $2, 'received')`,
      [rep.id, text]
    );
    await tg.send(chatId, answer);
  }

  return NextResponse.json({ ok: true });
}
