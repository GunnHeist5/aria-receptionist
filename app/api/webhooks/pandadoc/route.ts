import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool } from '@/lib/db';
import { sendOnboardingBurst } from '@/lib/onboarding-burst';

// PandaDoc webhook. Notes on the real payload shape (the previous version got
// all three wrong, so it never fired):
//   • Body is an ARRAY of event objects: [{ event, data: {...} }, ...]
//   • Completion arrives as event 'document_state_changed' with
//     data.status === 'document.completed'
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
    const data = ev?.data ?? ev?.document ?? {};
    if (data?.status !== 'document.completed') continue;

    const docId        = data?.id;
    const contractorId = data?.metadata?.contractor_id;
    if (!contractorId) { console.error('[pandadoc] completed doc missing contractor_id', docId); continue; }

    // Idempotent: only the first completion sets signed + returns the row to onboard.
    const { rows: [rep] } = await pool.query(
      `UPDATE contractors SET
         contract_document_id = $2,
         contract_signed_at   = NOW(),
         onboarding_status    = 'contract_signed',
         onboarding_step      = 3,
         updated_at           = NOW()
       WHERE id = $1 AND contract_signed_at IS NULL
       RETURNING name, channel_id, slug, commission_setup, commission_residual_pct`,
      [contractorId, docId]
    );

    // Fire the burst only if they've already connected Telegram. If not, the
    // /start ctr_ handler fires it when they tap their deep link.
    if (rep?.channel_id) await sendOnboardingBurst(rep);
  }

  return NextResponse.json({ ok: true });
}
