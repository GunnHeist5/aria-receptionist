'use strict';

/**
 * Central, env-configurable agent voice + call settings for Trillet.
 * Tune every provisioned agent's voice and call behavior here / via env — no
 * provider code changes needed.
 *
 * Env overrides (all optional; defaults match the prior hardcoded values):
 *   Voice / brain:
 *     TRILLET_TTS_PROVIDER          default 'rime'
 *     TRILLET_TTS_VOICE_ID          default 'mistv3_luna'
 *     TRILLET_TTS_LANGUAGE          default 'en'
 *     TRILLET_LLM_MODEL             default 'gemini-2.5-flash'
 *     TRILLET_SPEED                 default 0.95
 *     TRILLET_AGENT_SETTINGS_JSON   JSON merged into agent.settings — put any
 *                                   extra Trillet tuning here (interruption
 *                                   sensitivity, turn detection, responsiveness…)
 *   Call flow:
 *     TRILLET_MAX_CALL_DURATION     default 600  (seconds)
 *     TRILLET_END_CALL_ON_SILENCE   default 10   (seconds)
 *     TRILLET_CALL_SETTINGS_JSON    JSON merged into callFlow.settings.callSetting
 *
 * To discover exact field names Trillet supports for the JSON knobs, tune one
 * agent perfectly in the dashboard, then run scripts/trillet-agent-dump.js to
 * print its config and copy the values here.
 */

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function json(v) {
  if (!v) return {};
  try { const o = JSON.parse(v); return (o && typeof o === 'object') ? o : {}; }
  catch { console.error('[agent-config] ignoring invalid JSON env value:', String(v).slice(0, 60)); return {}; }
}

function agentDefaults() {
  return {
    ttsModel: {
      provider: (process.env.TRILLET_TTS_PROVIDER || 'rime').trim(),
      voiceId:  (process.env.TRILLET_TTS_VOICE_ID || 'mistv3_luna').trim(),
      language: (process.env.TRILLET_TTS_LANGUAGE || 'en').trim(),
    },
    llmModel: (process.env.TRILLET_LLM_MODEL || 'gemini-2.5-flash').trim(),
    settings: {
      speed: num(process.env.TRILLET_SPEED, 0.95),
      ...json(process.env.TRILLET_AGENT_SETTINGS_JSON),
    },
  };
}

function callFlowSettings() {
  return {
    callSetting: {
      maxCallDuration:  num(process.env.TRILLET_MAX_CALL_DURATION, 600),
      endCallOnSilence: num(process.env.TRILLET_END_CALL_ON_SILENCE, 10),
      ...json(process.env.TRILLET_CALL_SETTINGS_JSON),
    },
  };
}

module.exports = { agentDefaults, callFlowSettings };
