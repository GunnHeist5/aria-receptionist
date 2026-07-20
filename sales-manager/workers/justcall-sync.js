'use strict';

/**
 * JustCall call-log sync — replaces rep self-reporting for dials/connects.
 *
 * Flow (hourly from the sales worker, or manually via scripts/run-justcall-sync.js):
 *   1. AUTO-LINK  GET /v2.1/users → match user email ↔ contractors.email →
 *                 persist contractors.justcall_agent_id. Unmatched users are
 *                 reported, never guessed.
 *   2. PULL       GET /v2.1/calls for the last SYNC_WINDOW_DAYS (default 3),
 *                 paged. Upserted into the justcall_calls ledger keyed by
 *                 JustCall's call id — re-running can NEVER double-count.
 *   3. ROLLUP     For every (contractor, day) touched, recompute rep_activity
 *                 dials/connects FROM the ledger (SET, not +=). Demos come from
 *                 call_outcomes (transcript-extracted demo_method != 'none').
 *
 * Funnel definitions (learned from real data — call 394042357 was a VOICEMAIL
 * pickup that JustCall marks call_type='answered'):
 *   dial    = any outgoing call
 *   connect = outgoing + answered + conversation ≥ CONNECT_MIN_SEC (default 30s)
 * Closes are NOT touched here — Stripe/commissions remains the only source.
 */

const jc = require('../../lib/justcall');

const WINDOW_DAYS     = () => Math.max(1, parseInt(process.env.JUSTCALL_SYNC_WINDOW_DAYS || '3', 10) || 3);
const CONNECT_MIN_SEC = () => Math.max(0, parseInt(process.env.JUSTCALL_CONNECT_MIN_SEC || '30', 10) || 0);
const MAX_PAGES = 60; // safety valve: 60 × 100 calls per run (warned loudly if hit)

function fmtDt(d) {
  return d.toISOString().slice(0, 19).replace('T', ' '); // yyyy-mm-dd hh:mm:ss
}

/** Defensive field extraction — list-response candidates, most-documented first. */
function normalizeCall(c) {
  const info = c.call_info ?? {};
  const dur  = c.call_duration ?? {};
  const durationSec = Number(
    dur.conversation_time ?? dur.total_duration ?? c.duration ?? info.duration ?? 0
  ) || 0;
  const callAt =
    c.call_date && c.call_time ? `${c.call_date} ${c.call_time}` :
    (c.datetime ?? c.call_datetime ?? null);
  return {
    id:            Number(c.id),
    agentId:       c.agent_id != null ? Number(c.agent_id) : null,
    agentEmail:    c.agent_email ?? null,
    contactNumber: c.contact_number ?? c.client_number ?? null,
    direction:     String(info.direction ?? c.direction ?? '').toLowerCase(),
    callType:      String(info.type ?? c.call_type ?? '').toLowerCase(),
    disposition:   info.disposition ?? null,
    durationSec,
    callAt,
  };
}

async function autoLinkAgents(pool) {
  const res = await jc.jc('GET', '/v2.1/users', { query: { per_page: 100 } });
  const users = Array.isArray(res?.data) ? res.data : [];
  let linked = 0;
  const unmatched = [];
  for (const u of users) {
    const agentId = Number(u.agent_id ?? u.id);
    const email = (u.email || '').trim().toLowerCase();
    if (!agentId || !email) continue;
    const { rowCount } = await pool.query(
      `UPDATE contractors SET justcall_agent_id=$1
       WHERE lower(email)=$2 AND (justcall_agent_id IS DISTINCT FROM $1)`,
      [agentId, email]
    );
    if (rowCount) linked++;
    else {
      const { rows } = await pool.query(`SELECT 1 FROM contractors WHERE justcall_agent_id=$1 LIMIT 1`, [agentId]);
      if (!rows.length) unmatched.push(`${email} (agent_id ${agentId})`);
    }
  }
  return { users: users.length, linked, unmatched };
}

async function pullCalls(pool) {
  const from = new Date(Date.now() - WINDOW_DAYS() * 86_400_000);
  let page = 1, fetched = 0, upserted = 0;
  let shapeLogged = false;

  while (page <= MAX_PAGES) {
    const res = await jc.listCalls({
      per_page: 100, page,
      from_datetime: fmtDt(from),
      sort: 'id', order: 'desc',
    });
    const calls = Array.isArray(res?.data) ? res.data : [];
    if (!calls.length) break;

    for (const raw of calls) {
      const c = normalizeCall(raw);
      if (!c.id) {
        if (!shapeLogged) { shapeLogged = true; console.warn('[justcall-sync] unexpected call shape, keys:', Object.keys(raw).join(',')); }
        continue;
      }
      fetched++;
      const isConnect = c.direction.startsWith('out') && c.callType === 'answered' && c.durationSec >= CONNECT_MIN_SEC();
      const { rowCount } = await pool.query(
        `INSERT INTO justcall_calls
           (id, agent_id, agent_email, contractor_id, contact_number, direction, call_type, disposition, duration_sec, is_connect, call_at)
         VALUES ($1,$2,$3,
                 (SELECT id FROM contractors WHERE justcall_agent_id=$2 OR ($3 IS NOT NULL AND lower(email)=lower($3)) LIMIT 1),
                 $4,$5,$6,$7,$8,$9, COALESCE($10::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           call_type=$6, disposition=$7, duration_sec=$8, is_connect=$9, synced_at=NOW(),
           contractor_id = COALESCE(justcall_calls.contractor_id, EXCLUDED.contractor_id)`,
        [c.id, c.agentId, c.agentEmail, c.contactNumber, c.direction, c.callType,
         c.disposition, c.durationSec, isConnect, c.callAt]
      );
      upserted += rowCount;
    }
    if (calls.length < 100) break;
    page++;
  }
  if (page > MAX_PAGES) {
    // No silent caps: newest-first paging means a backlog beyond the cap is the
    // OLDEST calls — they'd never be fetched by later runs either. Say so.
    console.warn(`[justcall-sync] WARNING: hit MAX_PAGES=${MAX_PAGES} (${fetched} calls) — older calls in the window were NOT synced. Raise MAX_PAGES or run with a larger JUSTCALL_SYNC_WINDOW_DAYS once.`);
  }
  return { fetched, upserted, pages: Math.min(page, MAX_PAGES) };
}

async function rollupActivity(pool) {
  // Recompute every (contractor, day) present in the ledger inside the window.
  // SET semantics — JustCall is the source of truth for dials/connects now.
  //
  // DAY-ALIGNED window (CURRENT_DATE - N), never a rolling timestamp: a rolling
  // cut would recompute the oldest day from a shrinking partial slice of its
  // calls and SET-erode it toward zero as the window slides through it.
  //
  // demos are deliberately NOT touched: they have no reliable automated source
  // yet (transcript demo_method extraction is still being proven), so the
  // rep-supplied /log value is preserved. Revisit once extraction is verified.
  const { rows } = await pool.query(
    `WITH days AS (
       SELECT contractor_id, call_at::date AS d,
              COUNT(*) FILTER (WHERE direction LIKE 'out%')::int AS dials,
              COUNT(*) FILTER (WHERE is_connect)::int            AS connects
       FROM justcall_calls
       WHERE contractor_id IS NOT NULL
         AND call_at >= CURRENT_DATE - ($1::int)
       GROUP BY 1, 2
     )
     INSERT INTO rep_activity (contractor_id, date, dials, connects, demos)
     SELECT d.contractor_id, d.d, d.dials, d.connects, 0
     FROM days d
     ON CONFLICT (contractor_id, date) DO UPDATE SET
       dials    = EXCLUDED.dials,
       connects = EXCLUDED.connects,
       updated_at = NOW()
     RETURNING contractor_id, date, dials, connects`,
    [WINDOW_DAYS()]
  );
  return { daysUpdated: rows.length, rows };
}

/** Full sync pass. Idempotent — safe to run any number of times. */
async function runJustcallSync(pool) {
  const link = await autoLinkAgents(pool);
  const pull = await pullCalls(pool);
  const roll = await rollupActivity(pool);
  return {
    agents: { seats: link.users, newlyLinked: link.linked, unmatched: link.unmatched },
    calls:  { fetched: pull.fetched, upserted: pull.upserted },
    activity: { repDaysRecomputed: roll.daysUpdated },
  };
}

module.exports = { runJustcallSync, rollupActivity, normalizeCall };
