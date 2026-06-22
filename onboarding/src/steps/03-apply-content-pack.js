'use strict';

const { buildPlumbingV1 } = require('../content-packs/plumbing-v1');
const { buildHvacV1 }     = require('../content-packs/hvac-v1');
const { buildCombinedV1 } = require('../content-packs/combined-v1');

const STEP_KEY = 'apply_content_pack';

/**
 * Content pack registry — maps business_type → pack builder function.
 * Each builder: (client) → ContentPack
 */
const PACK_BUILDERS = {
  plumbing: buildPlumbingV1,
  hvac:     buildHvacV1,
  combined: buildCombinedV1,
};

/**
 * Step 3 — Apply a versioned content pack to the agent.
 *
 * Selects the correct pack builder based on client.business_type,
 * populates it with client data, and pushes it to the voice provider.
 *
 * DB writes on success:
 *   clients.content_pack_version      = pack.version (e.g. 'plumbing-v1')
 *   clients.provisioning_checkpoint   = { step, packVersion, agentId }
 *
 * @param {{ client: object, provider: import('../../../voice-provider/src/interface').VoiceProvider }} opts
 * @returns {Promise<import('../pipeline').StepResult>}
 */
async function applyContentPack({ client, provider }) {
  const buildPack = PACK_BUILDERS[client.business_type];
  if (!buildPack) {
    throw new Error(
      `[applyContentPack] No content pack defined for business_type="${client.business_type}". ` +
      `Add a builder to PACK_BUILDERS in ${__filename}.`
    );
  }

  const pack = buildPack(client);

  const { success, agentId, raw } = await provider.applyContentPack(
    client.voice_provider_account_id,
    pack
  );

  return {
    stepKey: STEP_KEY,
    clientUpdates: {
      content_pack_version:    pack.version,
      provisioning_checkpoint: JSON.stringify({ step: STEP_KEY, packVersion: pack.version, agentId }),
    },
    eventPayload: {
      step:        STEP_KEY,
      packVersion: pack.version,
      agentId,
      success,
      _raw:        raw,
    },
  };
}

module.exports = { applyContentPack, STEP_KEY };
