'use strict';

require('dotenv').config();
const { MockVoiceProvider }   = require('./mock.provider');
const { TrilletVoiceProvider } = require('./trillet.provider');

/**
 * Factory — returns the active VoiceProvider implementation.
 *
 * Controlled by the VOICE_PROVIDER environment variable:
 *   mock    → MockVoiceProvider  (in-memory, no external calls; default)
 *   trillet → TrilletVoiceProvider (real API; requires TRILLET_API_KEY)
 *
 * This is the ONLY import the rest of the system needs:
 *   const { createVoiceProvider } = require('../../voice-provider/src');
 *   const provider = createVoiceProvider();
 *   const { accountId } = await provider.createSubAccount(clientConfig);
 *
 * Never import MockVoiceProvider or TrilletVoiceProvider directly in
 * application code — doing so defeats the vendor-swap guarantee.
 *
 * @returns {import('./interface').VoiceProvider}
 */
function createVoiceProvider() {
  const impl = (process.env.VOICE_PROVIDER || 'mock').toLowerCase().trim();
  switch (impl) {
    case 'mock':
      return new MockVoiceProvider();
    case 'trillet':
      return new TrilletVoiceProvider();
    default:
      throw new Error(
        `Unknown VOICE_PROVIDER="${impl}". ` +
        'Valid values: "mock" (development/testing), "trillet" (production).'
      );
  }
}

module.exports = { createVoiceProvider };
