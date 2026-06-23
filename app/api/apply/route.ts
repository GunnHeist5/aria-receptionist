import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

async function notifyOwner(candidateId: string, name: string, email: string, phone: string | null, submission_url: string | null, application_text: string | null) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chatId) return;

  const lines = [
    `🎙️ <b>New sales rep application</b>`,
    ``,
    `<b>Name:</b> ${name}`,
    `<b>Email:</b> ${email}`,
    phone ? `<b>Phone:</b> ${phone}` : null,
    submission_url ? `<b>Recording:</b> <a href="${submission_url}">${submission_url}</a>` : `<b>Recording:</b> not provided`,
    application_text ? `\n<b>About them:</b>\n${application_text}` : null,
  ].filter(Boolean).join('\n');

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve & Send Contract', callback_data: `approve:candidate:${candidateId}` },
          { text: '❌ Archive',                 callback_data: `reject:candidate:${candidateId}` },
        ]],
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, phone, application_text, submission_url, utm_source } = body;

  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }

  const pool = getPool();
  let candidateId = '';

  try {
    const existing = await pool.query(`SELECT id FROM candidates WHERE email = $1 LIMIT 1`, [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, already_exists: true });
    }

    const { rows: [row] } = await pool.query(
      `INSERT INTO candidates (name, email, phone, application_text, submission_url, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'applied') RETURNING id`,
      [name, email.toLowerCase().trim(), phone ?? null, application_text ?? null,
       submission_url ?? null, utm_source ?? 'direct']
    );
    candidateId = row.id;
  } catch (err) {
    console.error('[apply] DB error:', err);
    return NextResponse.json({ error: 'Server error — please email your application to justin.yi0410@gmail.com' }, { status: 500 });
  }

  // Fire-and-forget — don't block the response on Telegram
  notifyOwner(candidateId, name, email.toLowerCase().trim(), phone ?? null, submission_url ?? null, application_text ?? null)
    .catch(e => console.error('[apply] Telegram notify failed:', e));

  return NextResponse.json({ ok: true });
}
