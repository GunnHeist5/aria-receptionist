import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/db';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tg = require('../../../../sales-manager/lib/telegram');

// PandaDoc webhook. Notes on the real payload shape:
//   • Body is an ARRAY of event objects: [{ event, data: {...} }, ...]
//   • We trigger on the REP completing their signature ('recipient_completed')
//     OR full document completion ('document_state_changed' + status
//     'document.completed') — whichever fires first. Triggering on
//     recipient_completed means a leftover owner/sender signature field on the
//     template cannot block onboarding: the rep's signature alone advances it.
//   • Signature is an HMAC-SHA256 hex of the RAW body, keyed with the shared
//     key, delivered in the `signature` query param (NOT a header).

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Verify HMAC signature when a shared key is configured.
  const secret = process.env.PANDADOC_WEBHOOK_SECRET?.trim();
  if (secret) {
    const provided = new URL(req.url).searchParams.get('signature') ?? '';
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.error('[pandadoc] signature mismatch — rejecting');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const events = Array.isArray(payload) ? payload : [payload];
  const pool = getPool();

  for (const ev of events as any[]) {
    const evType = ev?.event ?? ev?.type;
    const data   = ev?.data ?? ev?.document ?? {};

    // Rep signed their part (recipient_completed) OR doc fully completed.
    const repSigned = evType === 'recipient_completed' || data?.status === 'document.completed';
    if (!repSigned) continue;

    const docId        = data?.id;
    const contractorId = data?.metadata?.contractor_id;
    if (!contractorId) { console.error('[pandadoc] signed event missing contractor_id', docId, evType); continue; }

    // Idempotent: only the first completion records the signature.
    const { rows: [rep] } = await pool.query(
      `UPDATE contractors SET
         contract_document_id = $2,
         contract_signed_at   = NOW(),
         onboarding_status    = 'signed_pending_approval',
         updated_at           = NOW()
       WHERE id = $1 AND contract_signed_at IS NULL
       RETURNING id, name`,
      [contractorId, docId]
    );
    if (!rep) continue; // already processed

    // Onboarding is gated on owner approval — notify with Approve/Deny buttons.
    // The actual onboarding burst fires from the Telegram approve:onboard handler.
    await tg.sendToOwner(
      `✅ <b>${rep.name}</b> signed the contractor agreement.\n\n` +
      `Approve to onboard them now — sends their full briefing (script, objections, closer link) on Telegram.`,
      tg.approvalKeyboard('onboard', rep.id)
    );
  }

  return NextResponse.json({ ok: true });
}
