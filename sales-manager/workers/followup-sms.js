'use strict';

/**
 * No-answer follow-up loop.
 *
 * Businesses that missed a rep's call just demonstrated the exact problem the
 * product fixes. Once a day this sends each recent no-answer/voicemail lead ONE
 * text pointing at the demo line — then never texts that lead again.
 *
 * Safety model (all owner-controlled via .env):
 *   FOLLOWUP_SMS_ENABLED   'true' to actually send; anything else = dry-run
 *                          (logs the would-send list, sends nothing)
 *   FOLLOWUP_SMS_DAILY_CAP hard cap per day (default 50)
 *   JUSTCALL_SMS_FROM      sender number (verified via scripts/justcall-sms-probe.js)
 *   DEMO_NUMBER            the demo line number used in the message
 *
 * Concurrency + failure design (review-hardened):
 *   • CLAIM-FIRST: leads are stamped (followup_sms_at) in one atomic UPDATE
 *     before any send — a second process running the same job can't select
 *     them again, so no duplicate texts even with two schedulers alive.
 *   • Systemic-failure abort: 3 consecutive send failures (bad endpoint, auth,
 *     missing sender) aborts the run and UN-stamps everything not actually
 *     sent, so a config error can't silently burn the day's cohort.
 *   • Isolated failures (a bad number) stay stamped — never retried daily.
 *   • STOP replies set clients.do_not_contact (handled in the JustCall webhook).
 *   • Leads a rep already dispositioned are never texted.
 */

const jc = require('../../lib/justcall');

const ENABLED = () => (process.env.FOLLOWUP_SMS_ENABLED || '').toLowerCase() === 'true';
const CAP     = () => Math.max(0, parseInt(process.env.FOLLOWUP_SMS_DAILY_CAP || '50', 10) || 0);
const DEMO    = () => (process.env.DEMO_NUMBER || '+1 (215) 702-6522').trim();

const ELIGIBLE = `
      status = 'lead'
  AND do_not_contact IS NOT TRUE
  AND followup_sms_at IS NULL
  AND phone IS NOT NULL
  AND length(regexp_replace(phone, '\\D', '', 'g')) BETWEEN 10 AND 11
  AND last_call_outcome IN ('no_answer', 'voicemail')
  AND last_called_at > NOW() - INTERVAL '3 days'
  AND COALESCE(call_status, 'new') IN ('new', 'called')`;

let schemaReady = false;
async function ensureSchema(pool) {
  if (schemaReady) return;
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS followup_sms_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT false`);
  schemaReady = true;
}

// Timezone-safe on purpose: the VPS runs UTC, so a concrete "Tue 2:14pm" would
// be wrong for the lead. Vague-but-true beats precise-but-wrong.
function messageFor(lead) {
  return (
    `Hey ${lead.business_name} — we called you this week and couldn't reach you. ` +
    `Your customers hit the same thing. Hear the fix in 30 seconds: call ${DEMO()} ` +
    `and talk to the AI receptionist. — Reachwell. Reply STOP to opt out.`
  );
}

/** '+1XXXXXXXXXX' for a valid US 10/11-digit number, else null (skip). */
function toE164(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? '+1' + d : null;
}

/** One daily run. Returns a summary for the worker log. */
async function runFollowupSms(pool) {
  await ensureSchema(pool);
  const mode = ENABLED() ? 'live' : 'dry-run';

  const cap = CAP();
  const { rows: [{ sent_today }] } = await pool.query(
    `SELECT COUNT(*)::int AS sent_today FROM clients WHERE followup_sms_at::date = CURRENT_DATE`
  );
  const remaining = Math.max(0, cap - sent_today);
  if (!remaining) return { mode, sent: 0, note: 'daily cap reached' };

  if (!ENABLED()) {
    const { rows: leads } = await pool.query(
      `SELECT business_name, phone FROM clients WHERE ${ELIGIBLE}
       ORDER BY last_called_at DESC LIMIT $1`, [remaining]);
    if (!leads.length) return { mode, sent: 0, note: 'no eligible leads' };
    console.log(`[followup-sms] DRY-RUN — would text ${leads.length} lead(s):`);
    for (const l of leads.slice(0, 5)) console.log(`  • ${l.business_name} (${l.phone})`);
    if (leads.length > 5) console.log(`  … and ${leads.length - 5} more`);
    return { mode, sent: 0, wouldSend: leads.length };
  }

  // Preflight: a missing sender is a config error — abort before claiming.
  if (!(process.env.JUSTCALL_SMS_FROM || '').trim()) {
    console.error('[followup-sms] ABORT: FOLLOWUP_SMS_ENABLED=true but JUSTCALL_SMS_FROM is not set.');
    return { mode, sent: 0, note: 'aborted: JUSTCALL_SMS_FROM missing' };
  }

  // Atomic claim: stamp first so no other process can pick these leads up.
  const { rows: claimed } = await pool.query(
    `UPDATE clients SET followup_sms_at = NOW()
     WHERE id IN (
       SELECT id FROM clients WHERE ${ELIGIBLE}
       ORDER BY last_called_at DESC LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, business_name, phone`,
    [remaining]
  );
  if (!claimed.length) return { mode, sent: 0, note: 'no eligible leads' };

  const unstamp = async ids => {
    if (!ids.length) return;
    await pool.query(`UPDATE clients SET followup_sms_at = NULL WHERE id = ANY($1)`, [ids])
      .catch(e => console.error(`[followup-sms] UNSTAMP FAILED for ${ids.length} lead(s): ${e.message} — they will not be retried.`));
  };

  let sent = 0;
  let recentFailedIds = []; // ids of the current consecutive-failure streak
  for (let i = 0; i < claimed.length; i++) {
    const lead = claimed[i];
    const to = toE164(lead.phone);
    if (!to) { console.warn(`[followup-sms] skip ${lead.business_name}: unusable phone "${lead.phone}"`); continue; }
    try {
      await jc.sendText(to, messageFor(lead));
      sent++;
      recentFailedIds = [];
      await pool.query(
        `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
        [lead.id, JSON.stringify({ event: 'followup_sms_sent', to })]
      ).catch(e => console.error(`[followup-sms] event log failed: ${e.message}`));
      await new Promise(r => setTimeout(r, 1500)); // gentle pacing, no burst
    } catch (err) {
      recentFailedIds.push(lead.id);
      console.error(`[followup-sms] send failed for ${lead.business_name}: ${err.message}`);
      if (recentFailedIds.length >= 3) {
        // Systemic (endpoint/auth/config) — release the streak + everything unattempted.
        const notSent = [...recentFailedIds, ...claimed.slice(i + 1).map(l => l.id)];
        await unstamp(notSent);
        console.error(`[followup-sms] ABORT after 3 consecutive failures — released ${notSent.length} lead(s) for a future run. Check the SMS endpoint/auth (scripts/justcall-sms-probe.js).`);
        return { mode, sent, note: 'aborted: consecutive send failures' };
      }
      // Isolated failure: leave the stamp so a bad number isn't retried daily.
    }
  }
  return { mode, sent, of: claimed.length };
}

module.exports = { runFollowupSms };
