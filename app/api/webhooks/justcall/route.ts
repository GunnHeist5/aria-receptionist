import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jc = require('../../../../lib/justcall');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractCallData } = require('../../../../sales-manager/agents/call-extractor');

export const dynamic = 'force-dynamic';

// JustCall (and most webhook providers) ping the URL with a GET to verify it's
// reachable before saving. Return 200 so the "Webhook URL is not accessible"
// check passes. Real events arrive as POST below.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'justcall-webhook' });
}

/**
 * JustCall "Call AI report generated" webhook → extract structured data → write
 * to call_outcomes (same table the manual /call survey uses, so /insights keeps
 * working). Closes stay sourced from Stripe; outcome here is qualitative only.
 *
 * ⚠️ SCAFFOLD — NOT verified against a real webhook. Three things to confirm once
 * calling is live (see comments below): (1) the payload field paths, (2) the AI
 * transcript key names, (3) the JustCall-agent → contractor mapping.
 */
export async function POST(req: NextRequest) {
  // Auth: shared secret as ?secret= (same pattern as the Telegram/Stripe webhooks).
  const secret = process.env.JUSTCALL_WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({} as any));

  // (1) call id — exact path UNVERIFIED; try the likely candidates.
  const callId = payload?.call_id ?? payload?.id ?? payload?.data?.call_id ?? payload?.data?.id ?? null;
  if (!callId) return NextResponse.json({ ok: true, skipped: 'no call_id in payload' });

  const pool = getPool();
  try {
    // (2) transcript — prefer the webhook payload; else fetch via the API.
    let transcript = jc.transcriptToText(payload?.call_transcription ?? payload?.data?.call_transcription);
    let summary    = payload?.call_summary ?? payload?.data?.call_summary ?? null;
    if (!transcript) {
      const ai   = await jc.getCallAi(callId);
      const body = ai?.data ?? ai;
      transcript = jc.transcriptToText(body?.call_transcription);
      summary    = body?.call_summary ?? summary;
    }
    if (!transcript) return NextResponse.json({ ok: true, skipped: 'transcript not ready yet', callId });

    const extracted = await extractCallData(transcript, { summary });

    // (3) map the JustCall agent → our contractor. Best-effort by email for now;
    // a justcall_agent_id column on contractors is the robust fix before prod.
    const agentEmail = payload?.agent_email ?? payload?.data?.agent_email ?? null;
    let contractorId: string | null = null;
    if (agentEmail) {
      const { rows } = await pool.query('SELECT id FROM contractors WHERE lower(email)=lower($1) LIMIT 1', [agentEmail]);
      contractorId = rows[0]?.id ?? null;
    }

    await pool.query(
      `INSERT INTO call_outcomes (contractor_id, is_owner, outcome, primary_objection, demo_method, notes, logged_at)
       VALUES ($1, false, $2, $3, $4, $5, NOW())`,
      [contractorId, extracted.outcome, extracted.primary_objection, extracted.demo_method,
       `[auto] ${extracted.summary} (justcall:${callId})`]
    );

    return NextResponse.json({ ok: true, extracted, contractorId });
  } catch (err: unknown) {
    console.error('[justcall webhook]', err instanceof Error ? err.message : err);
    // 200 so JustCall doesn't hammer retries while we're still wiring this up.
    return NextResponse.json({ ok: false, error: 'processing failed' });
  }
}
