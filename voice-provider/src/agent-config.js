'use strict';

/**
 * Central, env-configurable agent voice + call settings for Trillet.
 * Tune every provisioned agent's voice and call behavior here / via env — no
 * provider code changes needed.
 *
 * What the Trillet agent-create API actually accepts (verified against the docs):
 *   - llmModel  ∈ gpt-4o-mini | gpt-4o | gpt-4o-enterprise | gpt-4.1 |
 *               gpt-4.1-mini(+ -enterprise) | gemini-2.5-flash | gemini-2.0-flash-001
 *               (NO gpt-5, NO "flash lite" by name, NO fallback model field)
 *   - ttsModel.provider ∈ openai | rime | elevenlabs | 11labs_byo | google
 *   - settings ∈ { speed, volume, temperature }
 *   STT, AI memory, persistent recall, and system-prompt toggles are NOT in the
 *   agent API — set those as workspace defaults in the Trillet dashboard so every
 *   created agent inherits them.
 *
 * Env overrides (all optional; defaults match the prior hardcoded values):
 *   Voice / brain:
 *     TRILLET_TTS_PROVIDER          default 'rime'
 *     TRILLET_TTS_VOICE_ID          default 'mistv3_luna'
 *     TRILLET_TTS_LANGUAGE          default 'en'
 *     TRILLET_LLM_MODEL             default 'gemini-2.5-flash' (must be from the list above)
 *     TRILLET_SPEED                 default 0.95
 *     TRILLET_VOLUME                only sent if set
 *     TRILLET_TEMPERATURE           only sent if set
 *     TRILLET_AGENT_SETTINGS_JSON   JSON merged into agent.settings — for any
 *                                   field the dump reveals that we don't map above
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
      ...(process.env.TRILLET_VOLUME      ? { volume:      num(process.env.TRILLET_VOLUME, 1) }        : {}),
      ...(process.env.TRILLET_TEMPERATURE ? { temperature: num(process.env.TRILLET_TEMPERATURE, 0.7) } : {}),
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
