import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

// PandaDoc sends a `status` field. We act on 'document.completed'.
// Verify the shared secret from PANDADOC_WEBHOOK_SECRET env var.
export async function POST(req: NextRequest) {
  const secret = process.env.PANDADOC_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get('x-pandadoc-signature');
    if (sig !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json();
  const event   = body?.event ?? body?.type;
  const docId   = body?.data?.id ?? body?.document?.id;
  const metadata = body?.data?.metadata ?? body?.document?.metadata ?? {};

  if (event !== 'document.completed') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const pool = getPool();

  // Expect metadata.contractor_id set when creating the PandaDoc document
  const contractorId = metadata.contractor_id;
  if (!contractorId) {
    console.error('[pandadoc] contract completed but no contractor_id in metadata', docId);
    return NextResponse.json({ ok: true });
  }

  await pool.query(
    `UPDATE contractors SET
       contract_document_id = $2,
       contract_signed_at   = NOW(),
       onboarding_status    = 'contract_signed',
       onboarding_step      = 1,
       updated_at           = NOW()
     WHERE id = $1`,
    [contractorId, docId]
  );

  // Notify rep via Telegram if channel is set
  const { rows: [rep] } = await pool.query(
    `SELECT name, channel_id FROM contractors WHERE id = $1`, [contractorId]
  );

  if (rep?.channel_id) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (TELEGRAM_BOT_TOKEN) {
      const msg = `✅ <b>You're in, ${rep.name.split(' ')[0]}.</b> Contract signed, you're officially a Reachwell rep.\n\nOver the next 3 days I'll send you everything you need — your pitch, objection playbook, and closer link.\n\nFor now: download this chat, you'll be using it daily.\n\nIf you have any questions before then, just text here. Talk tomorrow. 🤝`;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: rep.channel_id, text: msg }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
