'use strict';

const STEP_KEY = 'provision_number';

/**
 * Step 2 — Provision a phone number on the client's voice provider sub-account.
 *
 * Area code preference: derived from the client's own phone number (first 3 digits
 * after +1). Falls back gracefully if the number can't be parsed.
 *
 * DB writes on success:
 *   clients.provisioned_number        = E.164 phone number
 *   clients.provisioning_checkpoint   = { step, phoneNumber }
 *
 * @param {{ client: object, provider: import('../../../voice-provider/src/interface').VoiceProvider }} opts
 * @returns {Promise<import('../pipeline').StepResult>}
 */
async function provisionNumber({ client, provider }) {
  // Prefer the explicit areaCode stored in service_area (set by intake form).
  // Fall back to deriving from the client's own phone number.
  // For US numbers: strip non-digits, take the last 10 digits, first 3 = area code.
  //   '+15125550100' → '15125550100' → last 10 → '5125550100' → slice 0-3 → '512'
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
      provisioned_number:        phoneNumber,
      provisioning_checkpoint:   JSON.stringify({ step: STEP_KEY, phoneNumber, numberId }),
    },
    eventPayload: {
      step:        STEP_KEY,
      phoneNumber,
      numberId,
      areaCodeHint: areaCode,
      _raw:         raw,
    },
  };
}

module.exports = { provisionNumber, STEP_KEY };
