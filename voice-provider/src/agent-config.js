'use strict';

/**
 * Central, env-configurable agent voice / model / call settings for Trillet.
 * Defaults below mirror the hand-tuned reference agent (6a3c1dbf12765e2e058fd96d).
 * Adjust any value here or via the matching env var — every new agent the
 * pipeline creates picks it up.
 *
 * AGENT-LEVEL (sent to POST /agents):
 *   ttsModel             voice           — TRILLET_TTS_VOICE_ID / _PROVIDER / _LANGUAGE / _RIME_MODEL
 *   llmModel             primary brain   — TRILLET_LLM_MODEL          (e.g. gpt-5.1-chat-latest)
 *   fallbackLlmModel     fallback brain  — TRILLET_FALLBACK_LLM_MODEL (e.g. gemini-3.1-flash-lite)
 *   sttProvider.id       primary STT     — TRILLET_STT_ID             (e.g. deepgram-flux-multi)
 *   fallbackSttProvider  fallback STT    — TRILLET_FALLBACK_STT_ID    (e.g. deepgram-nova-3)
 *   settings             speed/volume/temperature
 *
 * CALL-FLOW-LEVEL (sent to /call-flows in applyContentPack):
 *   enableHumanLikeVoiceAndTone, enableTransferInstructions, utilizePriorCallsContext,
 *   identifierBasedWebDemoMemory, speechSetting (responsiveness/interruption/turn),
 *   callSetting (max duration / end-on-silence).
 */

function num(v, d)  { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function bool(v, d) { if (v === undefined || v === '') return d; return /^(1|true|yes|on)$/i.test(String(v).trim()); }
function json(v) {
  if (!v) return {};
  try { const o = JSON.parse(v); return (o && typeof o === 'object') ? o : {}; }
  catch { console.error('[agent-config] ignoring invalid JSON env value:', String(v).slice(0, 60)); return {}; }
}

// ── Agent-level config (POST /agents) ──────────────────────────────────────
function agentDefaults() {
  return {
    ttsModel: {
      provider:  (process.env.TRILLET_TTS_PROVIDER || 'rime').trim(),
      voiceId:   (process.env.TRILLET_TTS_VOICE_ID || 'mistv3_astra').trim(),
      language:  (process.env.TRILLET_TTS_LANGUAGE || 'en').trim(),
      rimeModel: (process.env.TRILLET_RIME_MODEL   || 'mistv3').trim(),
    },
    llmModel:         (process.env.TRILLET_LLM_MODEL          || 'gpt-5.1-chat-latest').trim(),
    fallbackLlmModel: (process.env.TRILLET_FALLBACK_LLM_MODEL || 'gemini-3.1-flash-lite').trim(),
    sttProvider:         { id: (process.env.TRILLET_STT_ID          || 'deepgram-flux-multi').trim() },
    fallbackSttProvider: { id: (process.env.TRILLET_FALLBACK_STT_ID || 'deepgram-nova-3').trim() },
    settings: {
      speed:       num(process.env.TRILLET_SPEED, 1.06),
      volume:      num(process.env.TRILLET_VOLUME, 1),
      temperature: num(process.env.TRILLET_TEMPERATURE, 0.3),
      ...json(process.env.TRILLET_AGENT_SETTINGS_JSON),
    },
  };
}

// ── Call-flow-level settings (applyContentPack → /call-flows) ──────────────
function callFlowSettings() {
  return {
    enableHumanLikeVoiceAndTone:  bool(process.env.TRILLET_HUMANLIKE_TONE, true),
    enableTransferInstructions:   bool(process.env.TRILLET_TRANSFER_INSTRUCTIONS, true),
    enableEndCallInstructions:    true,
    allowAgentHangUp:             true,
    utilizePriorCallsContext:     bool(process.env.TRILLET_PRIOR_CALLS_CONTEXT, true),
    identifierBasedWebDemoMemory: bool(process.env.TRILLET_WEB_DEMO_MEMORY, true),
    timeContextEnabled:           true,
    fasterInboundPickup:          true,
    enableRecording:              true,
    speechSetting: {
      responsiveness:             num(process.env.TRILLET_RESPONSIVENESS, 10),
      interruptionSensitivity:    num(process.env.TRILLET_INTERRUPTION_SENSITIVITY, 5.5),
      minimumConsecutiveSpeech:   num(process.env.TRILLET_MIN_CONSECUTIVE_SPEECH, 0.5),
      vadModel:                   'stt',
      enablePreemptiveGeneration: false,
    },
    callSetting: {
      maxCallDuration:            num(process.env.TRILLET_MAX_CALL_DURATION, 1800),
      endCallOnSilence:           num(process.env.TRILLET_END_CALL_ON_SILENCE, 10),
      enableLlmCache:             true,
      enableComplianceMonitoring: true,
      ...json(process.env.TRILLET_CALL_SETTINGS_JSON),
    },
  };
}

module.exports = { agentDefaults, callFlowSettings };
