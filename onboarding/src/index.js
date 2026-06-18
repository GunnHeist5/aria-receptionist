'use strict';

require('dotenv').config();
const { runPipeline } = require('./pipeline');
const { createVoiceProvider } = require('../../voice-provider/src/index');

/**
 * Public entry point for the onboarding pipeline.
 *
 * Usage (orchestrator / Jarvis):
 *   const { runOnboarding } = require('./onboarding/src');
 *   const pool     = getPool();            // from ai-receptionist-db/scripts/db.js
 *   const provider = createVoiceProvider(); // auto-selected from VOICE_PROVIDER env
 *   await runOnboarding(clientId, { db: pool });
 *
 * Usage (tests — inject mock dependencies):
 *   const mock = new MockVoiceProvider();
 *   await runOnboarding(clientId, { db: memDb, provider: mock });
 *
 * @param {string} clientId
 * @param {{
 *   db:        object,                                                  — pg.Pool or MemDb
 *   provider?: import('../../voice-provider/src/interface').VoiceProvider  — defaults to env selection
 * }} opts
 * @returns {Promise<{ runId: string }>}
 */
async function runOnboarding(clientId, { db, provider }) {
  const resolvedProvider = provider ?? createVoiceProvider();
  return runPipeline(clientId, { db, provider: resolvedProvider });
}

module.exports = { runOnboarding };
