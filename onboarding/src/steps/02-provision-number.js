'use strict';

const { ManualNumberPause } = require('../manual-pause');

const STEP_KEY = 'provision_number';

/**
 * Step — Provision (or manually gate) the agent's phone number.
 *
 * Trillet LiveKit bug: API-key purchases don't wire LiveKit inbound routing, so
 * for the REAL provider we do NOT auto-buy. Instead:
 *   • If clients.provisioned_number is already set (the owner bought + attached a
 *     number in the dashboard and recorded it via resume) → proceed.
 *   • Otherwise → throw ManualNumberPause, which the pipeline turns into a clean
 *     PAUSE: the agent is left fully built + configured, waiting for the manual
 *     number step, and the run stays resumable.
 *
 * The mock provider (autoProvisionsNumber=true) and AUTO_PURCHASE_NUMBER=true
 * take the auto-buy path instead, so dev/test and any future fixed/BYOD flow
 * complete without pausing.
 *
 * @param {{ client: object, provider: import('../../../voice-provider/src/interface').VoiceProvider }} opts
 * @returns {Promise<import('../pipeline').StepResult>}
 */
async function provisionNumber({ client, provider }) {
  const autoBuy =
    (provider && provider.autoProvisionsNumber === true) ||
    (process.env.AUTO_PURCHASE_NUMBER || '').toLowerCase() === 'true';

  // ── Manual-number mode (real Trillet, default) ─────────────────────────────
  if (!autoBuy) {
    if (client.provisioned_number) {
      // Number was bought + attached in the dashboard and recorded on resume.
      return {
        stepKey: STEP_KEY,
        clientUpdates: {
          provisioning_checkpoint: JSON.stringify({ step: STEP_KEY, phoneNumber: client.provisioned_number, mode: 'manual' }),
        },
        eventPayload: { step: STEP_KEY, phoneNumber: client.provisioned_number, mode: 'manual', resumed: true },
      };
    }
    throw new ManualNumberPause(
      'Awaiting manual number — buy a number in the Trillet dashboard, attach it to the agent, ' +
      'then resume: scripts/resume-provisioning.js <clientId> <+E164>.'
    );
  }

  // ── Auto-buy path (mock, or AUTO_PURCHASE_NUMBER=true) ─────────────────────
  const serviceArea = (typeof client.service_area === 'object' && client.service_area) || {};
  const digits      = String(client.phone || '').replace(/\D/g, '');
  const areaCode    = serviceArea.areaCode
    || (digits.length >= 10 ? digits.slice(-10, -7) : undefined);

  const { phoneNumber, numberId, raw } = await provider.provisionNumber(
    client.voice_provider_account_id,
    { areaCode, state: client.state }
  );

  return {
    stepKey: STEP_KEY,
    clientUpdates: {
      provisioned_number:      phoneNumber,
      provisioning_checkpoint: JSON.stringify({ step: STEP_KEY, phoneNumber, numberId }),
    },
    eventPayload: { step: STEP_KEY, phoneNumber, numberId, areaCodeHint: areaCode, _raw: raw },
  };
}

module.exports = { provisionNumber, STEP_KEY };
