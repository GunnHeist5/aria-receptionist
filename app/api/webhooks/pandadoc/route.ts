import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { sendOnboardingBurst } from '@/lib/onboarding-burst';

export async function POST(req: NextRequest) {
  const secret = process.env.PANDADOC_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get('x-pandadoc-signature');
    if (sig !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body      = await req.json();
  const event     = body?.event ?? body?.type;
  const docId     = body?.data?.id ?? body?.document?.id;
  const metadata  = body?.data?.metadata ?? body?.document?.metadata ?? {};

  if (event !== 'document.completed') return NextResponse.json({ ok: true, ignored: true });

  const pool         = getPool();
  const contractorId = metadata.contractor_id;
  if (!contractorId) {
    console.error('[pandadoc] no contractor_id in metadata', docId);
    return NextResponse.json({ ok: true });
  }

  // Mark signed, set onboarding_step=3 (burst messages sent here, worker handles day 7+)
  await pool.query(
    `UPDATE contractors SET
       contract_document_id = $2,
       contract_signed_at   = NOW(),
       onboarding_status    = 'contract_signed',
       onboarding_step      = 3,
       updated_at           = NOW()
     WHERE id = $1`,
    [contractorId, docId]
  );

  const { rows: [rep] } = await pool.query(
    `SELECT name, channel_id, slug, commission_setup, commission_residual_pct FROM contractors WHERE id = $1`,
    [contractorId]
  );

  if (rep?.channel_id) {
    await sendOnboardingBurst(rep);
  }
  // If channel_id is null the rep hasn't connected Telegram yet.
  // The /start handler in the Telegram webhook will fire the burst when they do.

  return NextResponse.json({ ok: true });
}
