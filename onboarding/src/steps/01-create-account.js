'use strict';

const STEP_KEY = 'create_account';

/**
 * Step 1 — Create a sub-account in the voice provider for this client.
 *
 * DB writes on success:
 *   clients.voice_provider             = name of the active provider (from VOICE_PROVIDER env)
 *   clients.voice_provider_account_id  = accountId returned by provider
 *   clients.provisioning_checkpoint    = { step, accountId } (jsonb snapshot)
 *
 * @param {{ client: object, provider: import('../../../voice-provider/src/interface').VoiceProvider }} opts
 * @returns {Promise<import('../pipeline').StepResult>}
 */
async function createAccount({ client, provider }) {
  const voiceProviderName = process.env.VOICE_PROVIDER || 'mock';

  const { accountId, raw } = await provider.createSubAccount({
    clientId:           client.id,
    businessName:       client.business_name,
    businessType:       client.business_type,
    website:            client.website             || null,
    forwardToNumber:    client.forward_to_number,
    tone:               client.tone,
    businessHours:      client.business_hours      || {},
    servicesOffered:    client.services_offered    || [],
    serviceArea:        client.service_area        || {},
    doNotSay:           client.do_not_say          || [],
    escalationKeywords: client.escalation_keywords || [],
    afterHoursBehavior: client.after_hours_behavior,
    alertDestination:   client.alert_destination   || {},
    pricingNotes:       client.pricing_notes       || null,
  });

  return {
    stepKey: STEP_KEY,
    clientUpdates: {
      voice_provider:            voiceProviderName,
      voice_provider_account_id: accountId,
      provisioning_checkpoint:   JSON.stringify({ step: STEP_KEY, accountId }),
    },
    eventPayload: {
      step:      STEP_KEY,
      provider:  voiceProviderName,
      accountId,
      _raw:      raw,
    },
  };
}

module.exports = { createAccount, STEP_KEY };
