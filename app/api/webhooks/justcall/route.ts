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
 * Field paths are aligned to JustCall's Call Events docs + a real call inspected
 * via the API (call 394042357): event type in `type` (call.completed /
 * sd.call_completed / jc.call_ai_generated / sd.call_ai_generated), payload in
 * `data`, status at `data.call_info.type` (answered|missed|voicemail — NOTE a
 * voicemail pickup counts as "answered"), transcript at
 * `data.justcall_ai.call_transcription` [{speaker_id, sentence, timestamp}].
 * Remaining to observe live: one actual webhook delivery end-to-end. The
 * WHITELIST and never-overwrite-a-human-disposition guard stay as backstops.
 */

// --- helpers ---------------------------------------------------------------

// Event type lives in `type` per JustCall's Call Events docs; keep fallbacks
// for older webhook formats.
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

// Add tracking columns once per process (not per request). Includes the
// call_outcomes columns this route writes, so a deploy that reaches prod
// before scripts/migrate-justcall.js runs can't silently drop AI reports
// (we 200-ack errors, so JustCall would never retry them).
let schemaReady: Promise<void> | null = null;
function ensureSchema(pool: any): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_call_outcome VARCHAR(50)`);
      await pool.query(`ALTER TABLE call_outcomes ADD COLUMN IF NOT EXISTS who_answered TEXT`);
      await pool.query(`ALTER TABLE call_outcomes ADD COLUMN IF NOT EXISTS heard_ai_before TEXT`);
      await pool.query(`ALTER TABLE call_outcomes ADD COLUMN IF NOT EXISTS justcall_call_id BIGINT`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS call_outcomes_justcall_id_idx ON call_outcomes (justcall_call_id) WHERE justcall_call_id IS NOT NULL`);
    })().catch((e: unknown) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// Same memoization for the opt-out column (ALTER takes an exclusive lock —
// never run it per-request on a hot webhook path).
let optOutReady: Promise<void> | null = null;
function ensureOptOutColumn(pool: any): Promise<void> {
  if (!optOutReady) {
    optOutReady = pool
      .query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT false`)
      .then(() => undefined)
      .catch((e: unknown) => { optOutReady = null; throw e; });
  }
  return optOutReady;
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

  // Inbound SMS: the ONLY thing we act on is a STOP reply (opt-out for the
  // follow-up loop). (UNVERIFIED field paths — flagged like the rest.)
  const isSms = /sms|text|message/.test(type) && !isAiReport;
  if (isSms) {
    const smsBody = String(
      payload?.sms_info?.body ?? body?.sms_info?.body ??
      payload?.body ?? body?.body ?? payload?.sms_body ?? body?.sms_body ?? ''
    ).trim().toUpperCase();
    const direction = String(payload?.direction ?? body?.direction ?? '').toLowerCase();
    // ^in matches incoming/inbound but NOT "outgoing" (which contains "in").
    // Unknown direction → treat as inbound; safe because we only act on STOP.
    const isInbound = !direction || /^in/.test(direction);
    if (isInbound && /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|QUIT|END)\b/.test(smsBody)) {
      const from = String(
        payload?.contact_number ?? body?.contact_number ??
        payload?.from ?? body?.from ?? payload?.client_number ?? body?.client_number ?? ''
      ).replace(/\D/g, '').slice(-10);
      if (from.length === 10) {
        try {
          const pool = getPool();
          await ensureOptOutColumn(pool);
          // Leads only: paying customers never get follow-up texts, and their
          // rows must not be mutated from an unverified webhook branch.
          const { rowCount } = await pool.query(
            `UPDATE clients SET do_not_contact = true
             WHERE status = 'lead'
               AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1`,
            [from]
          );
          return NextResponse.json({ ok: true, type: 'sms-stop', optedOut: rowCount });
        } catch (err: unknown) {
          // An opt-out MUST NOT vanish silently — log loudly for follow-up.
          console.error('[justcall webhook] STOP opt-out FAILED for', from, '-', err instanceof Error ? err.message : err);
          return NextResponse.json({ ok: false, type: 'sms-stop', error: 'opt-out failed' });
        }
      }
    }
    return NextResponse.json({ ok: true, ignored: 'sms' });
  }

  // WHITELIST — only the events above do anything. Every other now-enabled
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

  // Contact number: `data.contact_number` per Call Events docs (fallbacks kept).
  const number =
    body?.contact_number ?? payload?.contact_number ??
    payload?.client_number  ?? body?.client_number  ??
    payload?.called_number  ?? body?.called_number  ??
    payload?.customer_number ?? body?.customer_number ??
    payload?.to ?? body?.to ?? body?.contact?.phone ?? null;
  const num = last10(number);
  if (!num) {
    return NextResponse.json({ ok: true, type: 'call-completed', skipped: 'no contact number in payload' });
  }

  // Status lives at `data.call_info.type` (answered|missed|voicemail) per the
  // docs + real call 394042357. Older/other formats as fallbacks.
  const rawStatus = String(
    body?.call_info?.type ?? payload?.call_info?.type ??
    payload?.call_status ?? body?.call_status ??
    payload?.disposition ?? body?.disposition ??
    payload?.status ?? body?.status ?? ''
  ).toLowerCase();

  // Conversation seconds from `data.call_duration` (docs-confirmed). Used to
  // separate real conversations from voicemail pickups, which JustCall marks
  // call_info.type='answered' (observed on real call 394042357).
  const dur = body?.call_duration ?? payload?.call_duration ?? {};
  const convSec = Number(dur?.conversation_time ?? dur?.total_duration ?? NaN);
  const minConnectSec = Math.max(0, parseInt(process.env.JUSTCALL_CONNECT_MIN_SEC || '30', 10) || 0);

  // Map to a coarse outcome. Default to a neutral 'completed' when the status
  // field is missing/unrecognised — never guess "no_answer".
  let outcome = 'completed';
  let connected = false;
  if (rawStatus) {
    if (/no.?answer|unanswer|missed|noanswer/.test(rawStatus)) outcome = 'no_answer';
    else if (/busy/.test(rawStatus)) outcome = 'busy';
    else if (/voicemail|machine|vm/.test(rawStatus)) outcome = 'voicemail';
    else if (/fail|cancel|reject|decline/.test(rawStatus)) outcome = 'failed';
    else if (/answer|complet|connect/.test(rawStatus)) {
      if (Number.isFinite(convSec) && convSec < minConnectSec) {
        // "Answered" but almost no conversation → voicemail pickup or instant
        // hang-up. Not a connect; keeps the lead eligible for follow-up SMS.
        outcome = 'voicemail';
      } else {
        outcome = 'answered'; connected = true;
      }
    }
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

/** "AI report generated" (jc/sd.call_ai_generated) → extract → call_outcomes. */
async function handleAiReport(pool: any, payload: any, body: any) {
  await ensureSchema(pool);

  // Call id: `data.id` per Call Events docs (fallbacks kept).
  const callId = body?.id ?? body?.call_id ?? payload?.call_id ?? payload?.id ?? null;

  // Transcript: inline at `data.justcall_ai.call_transcription` per docs; else
  // fetch via /v2.1/calls_ai/{id} (path verified live). Real transcript entries
  // are [{speaker_id, speaker_name, sentence, timestamp}] — confirmed on call
  // 394042357.
  const aiInline = body?.justcall_ai ?? payload?.justcall_ai ?? null;
  let transcript = jc.transcriptToText(
    aiInline?.call_transcription ?? payload?.call_transcription ?? body?.call_transcription);
  let summary = aiInline?.call_summary ?? payload?.call_summary ?? body?.call_summary ?? null;
  if (!transcript && callId) {
    const ai = await jc.getCallAi(callId);
    const aibody = ai?.data ?? ai;
    transcript = jc.transcriptToText(aibody?.call_transcription);
    summary = aibody?.call_summary ?? summary;
  }
  if (!transcript) return NextResponse.json({ ok: true, type: 'ai-report', skipped: 'transcript not ready yet', callId });

  // Idempotency: the unique index on call_outcomes.justcall_call_id makes
  // repeat deliveries (jc.* + sd.* twin events, retries) no-ops. Check BEFORE the
  // Claude call to avoid paying for extraction twice. Known accepted race: two
  // near-simultaneous deliveries can both pass this SELECT and both run
  // extraction (~fractions of a cent on Haiku) — the index still guarantees only
  // one row lands.
  if (callId) {
    const { rows: dupe } = await pool.query(
      `SELECT 1 FROM call_outcomes WHERE justcall_call_id = $1 LIMIT 1`, [callId]);
    if (dupe.length) return NextResponse.json({ ok: true, type: 'ai-report', skipped: 'already extracted', callId });
  }

  const extracted = await extractCallData(transcript, { summary });

  // Agent → contractor: justcall_agent_id first (synced by the hourly job),
  // email fallback. `data.agent_id` / `data.agent_email` per docs.
  const agentId = body?.agent_id ?? payload?.agent_id ?? null;
  const agentEmail = body?.agent_email ?? payload?.agent_email ?? null;
  let contractorId: string | null = null;
  if (agentId != null) {
    const { rows } = await pool.query('SELECT id FROM contractors WHERE justcall_agent_id=$1 LIMIT 1', [agentId]);
    contractorId = rows[0]?.id ?? null;
  }
  if (!contractorId && agentEmail) {
    const { rows } = await pool.query('SELECT id FROM contractors WHERE lower(email)=lower($1) LIMIT 1', [agentEmail]);
    contractorId = rows[0]?.id ?? null;
  }

  // Business name for readable /insights notes: match the dialed lead.
  const num = last10(body?.contact_number ?? payload?.contact_number);
  let businessName: string | null = null;
  if (num) {
    const { rows } = await pool.query(
      `SELECT business_name FROM clients WHERE right(regexp_replace(phone,'\\D','','g'),10)=$1 LIMIT 1`, [num]);
    businessName = rows[0]?.business_name ?? null;
  }

  await pool.query(
    `INSERT INTO call_outcomes
       (contractor_id, is_owner, business_name, outcome, primary_objection, demo_method,
        who_answered, heard_ai_before, notes, justcall_call_id, logged_at)
     VALUES ($1, false, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (justcall_call_id) WHERE justcall_call_id IS NOT NULL DO NOTHING`,
    [contractorId, businessName, extracted.outcome, extracted.primary_objection, extracted.demo_method,
     extracted.who_answered, extracted.heard_ai_before,
     `[auto] ${extracted.summary} (justcall:${callId})`, callId]
  );

  return NextResponse.json({ ok: true, type: 'ai-report', extracted, contractorId, businessName });
}
