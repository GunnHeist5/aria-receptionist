'use strict';

const STEP_KEY = 'activate';

/**
 * Step 5 — Activate the client: transition status → 'live'.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  OPEN DECISION — live-vs-billing order (resolve when Stripe is wired in) ║
 * ║                                                                          ║
 * ║  Currently: status='live' is set immediately; billing_status='pending'  ║
 * ║  is a marker for the billing component to pick up (create Stripe         ║
 * ║  customer + subscription) after the fact.                                ║
 * ║                                                                          ║
 * ║  Once Stripe is integrated, decide:                                      ║
 * ║  A) Activate now, bill after (current behaviour)                        ║
 * ║     Pro:  client goes live instantly; best activation experience.        ║
 * ║     Con:  we eat Trillet usage costs if Stripe setup fails post-live.   ║
 * ║                                                                          ║
 * ║  B) Confirm Stripe subscription first, then set status='live'           ║
 * ║     Pro:  zero usage cost without confirmed payment.                     ║
 * ║     Con:  activation latency tied to Stripe API; worse client UX.       ║
 * ║                                                                          ║
 * ║  C) Activate + charge concurrently; deprovision if payment fails        ║
 * ║     within a grace window (e.g. 24h).                                    ║
 * ║     Pro:  fast activation + payment safety net.                         ║
 * ║     Con:  requires a separate grace-period cron job.                    ║
 * ║                                                                          ║
 * ║  This decision belongs in the Stripe billing design session.             ║
 * ║  Reference: onboarding/README.md § "Billing integration decision"       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * DB writes on success:
 *   clients.status          = 'live'
 *   clients.activated_at    = now
 *   clients.billing_status  = 'pending'  (Stripe component moves this to 'active')
 *   clients.provisioning_checkpoint = { step: 'activate', completedAt }
 *
 * @param {{ client: object, provider: import('../../../voice-provider/src/interface').VoiceProvider }} opts
 * @returns {Promise<import('../pipeline').StepResult>}
 */
// eslint-disable-next-line no-unused-vars
async function activate({ client, provider }) {
  const now = new Date();

  return {
    stepKey: STEP_KEY,
    clientUpdates: {
      status:                  'live',
      activated_at:            now,
      // billing_status is already 'active' — set by the Stripe webhook before provisioning starts.
      // Do NOT clobber it here.
      provisioning_checkpoint: JSON.stringify({ step: STEP_KEY, completedAt: now.toISOString() }),
    },
    eventPayload: {
      step:     STEP_KEY,
      provider: client.voice_provider,
      number:   client.provisioned_number,
      packVersion: client.content_pack_version,
    },
  };
}

module.exports = { activate, STEP_KEY };
