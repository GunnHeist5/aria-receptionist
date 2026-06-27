import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jc = require('../../../../lib/justcall');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractCallData } = require('../../../../sales-manager/agents/call-extractor');

export const dynamic = 'force-dynamic';

// JustCall pings the URL with a GET to verify it's reachable before saving.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'justcall-webhook' });
}

/**
 * JustCall webhook receiver. Two event types are handled; everything else is
 * acknowledged-and-ignored (every event is enabled on the JustCall side, so we
 * get SMS / contact / call-started / etc. that we don't use).
 *
 *   • "Call AI report generated" → transcript → extractCallData → call_outcomes
 *     (qualitative only; closes stay sourced from Stripe). /insights reads this.
 *   • "Call completed"           → stamp the lead's attempt + outcome on `clients`
 *     (records every dial incl. no-answers; JustCall's Reattempt Rules do the redial).
 *
 * ⚠️ SCAFFOLD — field paths below are UNVERIFIED against a real payload. The three
 * `UNVERIFIED` blocks (event-type field, number/disposition fields, AI transcript
 * keys) are what to confirm once a real Sales Dialer call fires. The WHITELIST and
 * the "never overwrite a human disposition" guard are written to fail safe until then.
 */

// --- helpers ---------------------------------------------------------------

// (UNVERIFIED) Pull a likely event-type string. JustCall's exact field name isn't
// confirmed — try the common candidates and normalise to a lowercase string.
function eventType(p: any): string {
  const raw =
    p?.type ?? p?.event ?? p?.event_type ?? p?.webhook_type ??
    p?.webhook ?? p?.data?.type ?? p?.data?.event ?? '';
  return String(raw || '').toLowerCase();
}

// Last 10 digits of any phone format (+1 (907) 563-0196 → 9075630196).
function last10(v: any): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

// Add the tracking column once per process (not per request).
let schemaReady: Promise<void> | null = null;
function ensureSchema(pool: any): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_call_outcome VARCHAR(50)`)
      .then(() => undefined)
      .catch((e: unknown) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// --- route -----------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Auth: shared secret as ?secret= (same pattern as Telegram/Stripe webhooks).
  const secret = process.env.JUSTCALL_WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload: any = await req.json().catch(() => ({}));
  const body: any = payload?.data ?? payload;
  const type = eventType(payload);

  // (UNVERIFIED) classify the event. Prefer explicit type strings; fall back to
  // the shape (a transcript present ⇒ AI report).
  const hasTranscript = !!(
    payload?.call_transcription ?? body?.call_transcription ??
    payload?.call_summary ?? body?.call_summary
  );
  const isAiReport = /ai|report|transcri|summary/.test(type) || hasTranscript;
  const isCallComplete = /call.?completed|completed|call.?ended|hangup|disposition/.test(type);

  // WHITELIST — only the two events above do anything. Every other now-enabled
  // event is acked (200) so JustCall doesn't retry, and we never act on data we
  // don't understand. This is also what stops a non-AI event from triggering a
  // phantom transcript fetch.
  if (!isAiReport && !isCallComplete) {
    return NextResponse.json({ ok: true, ignored: type || 'unknown-event' });
  }

  const pool = getPool();
  try {
    if (isCallComplete && !isAiReport) return await handleCallCompleted(pool, payload, body);
    return await handleAiReport(pool, payload, body);
  } catch (err: unknown) {
    console.error('[justcall webhook]', err instanceof Error ? err.message : err);
    // 200 so JustCall doesn't hammer retries while we're still wiring this up.
    return NextResponse.json({ ok: false, error: 'processing failed' });
  }
}

// --- handlers --------------------------------------------------------------

/** "Call completed" → record the attempt + outcome on the matching lead. */
async function handleCallCompleted(pool: any, payload: any, body: any) {
  await ensureSchema(pool);

  // (UNVERIFIED) the dialed/contact number — try the common field names.
  const number =
    payload?.contact_number ?? body?.contact_number ??
    payload?.client_number  ?? body?.client_number  ??
    payload?.called_number  ?? body?.called_number  ??
    payload?.customer_number ?? body?.customer_number ??
    payload?.to ?? body?.to ?? body?.contact?.phone ?? null;
  const num = last10(number);
  if (!num) {
    return NextResponse.json({ ok: true, type: 'call-completed', skipped: 'no contact number in payload' });
  }

  // (UNVERIFIED) the call status / disposition.
  const rawStatus = String(
    payload?.call_status ?? body?.call_status ??
    payload?.disposition ?? body?.disposition ??
    payload?.status ?? body?.status ?? ''
  ).toLowerCase();

  // Map to a coarse outcome. Default to a neutral 'completed' when the status
  // field is missing/unrecognised — never guess "no_answer".
  let outcome = 'completed';
  let connected = false;
  if (rawStatus) {
    if (/no.?answer|unanswer|missed|noanswer/.test(rawStatus)) outcome = 'no_answer';
    else if (/busy/.test(rawStatus)) outcome = 'busy';
    else if (/voicemail|machine|vm/.test(rawStatus)) outcome = 'voicemail';
    else if (/fail|cancel|reject|decline/.test(rawStatus)) outcome = 'failed';
    else if (/answer|complet|connect/.test(rawStatus)) { outcome = 'answered'; connected = true; }
    else outcome = rawStatus.slice(0, 50);
  }

  // Always record the attempt (last_called_at + raw outcome). Only auto-advance
  // 'new' → 'called' on a real connect, and NEVER overwrite a human disposition
  // (interested/callback/not_interested) or a converted lead.
  const { rowCount } = await pool.query(
    `UPDATE clients
        SET last_called_at    = NOW(),
            last_call_outcome = $2,
            call_status = CASE
              WHEN $3::bool AND COALESCE(call_status, 'new') = 'new' THEN 'called'
              ELSE call_status
            END
      WHERE status = 'lead'
        AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1`,
    [num, outcome, connected]
  );

  return NextResponse.json({ ok: true, type: 'call-completed', outcome, matchedLeads: rowCount });
}

/** "Call AI report generated" → extract structured data → call_outcomes. */
async function handleAiReport(pool: any, payload: any, body: any) {
  // (UNVERIFIED) call id path.
  const callId = payload?.call_id ?? payload?.id ?? body?.call_id ?? body?.id ?? null;

  // Prefer the inline transcript; else fetch via the API (only because this IS an
  // AI event — the whitelist guarantees we never reach here for a plain call event).
  let transcript = jc.transcriptToText(payload?.call_transcription ?? body?.call_transcription);
  let summary = payload?.call_summary ?? body?.call_summary ?? null;
  if (!transcript && callId) {
    const ai = await jc.getCallAi(callId);
    const aibody = ai?.data ?? ai;
    transcript = jc.transcriptToText(aibody?.call_transcription);
    summary = aibody?.call_summary ?? summary;
  }
  if (!transcript) return NextResponse.json({ ok: true, type: 'ai-report', skipped: 'transcript not ready yet', callId });

  const extracted = await extractCallData(transcript, { summary });

  // (UNVERIFIED) map the JustCall agent → our contractor, best-effort by email.
  // A justcall_agent_id column on contractors is the robust fix once reps have
  // their own seats.
  const agentEmail = payload?.agent_email ?? body?.agent_email ?? null;
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

  return NextResponse.json({ ok: true, type: 'ai-report', extracted, contractorId });
}
