'use strict';

const STEP_KEY = 'run_test_call';

/**
 * Step 4 — Run a test call to confirm the agent is live and responding.
 *
 * Calls the number in TEST_CALL_NUMBER env var (typically the operator's own phone).
 * If TEST_CALL_NUMBER is not configured, the step SKIPS GRACEFULLY and logs why —
 * it does NOT hard-fail the pipeline. This allows onboarding to complete in
 * environments where a test call isn't needed (CI, automated re-runs, etc.).
 *
 * DB writes on success: none (test calls are diagnostic only — no client field changes)
 * Events written: provisioning_step with latencyMs, or skipped reason if no test number.
 *
 * @param {{ client: object, provider: import('../../../voice-provider/src/interface').VoiceProvider }} opts
 * @returns {Promise<import('../pipeline').StepResult>}
 */
async function runTestCall({ client, provider }) {
  // Prefer explicit override, fall back to the client's own forward-to number.
  // forward_to_number is required on the intake form, so this runs for every client
  // automatically — the AI calls them from their new number to introduce itself.
  const callTo = process.env.TEST_CALL_NUMBER || client.forward_to_number;

  if (!callTo) {
    return {
      stepKey:       STEP_KEY,
      clientUpdates: {},
      eventPayload:  {},
      skipped:       true,
      skipReason:    'No call target — TEST_CALL_NUMBER not set and forward_to_number missing',
    };
  }

  // Brief pause so Trillet fully propagates the number-to-agent link before the call.
  await new Promise(r => setTimeout(r, 5_000));

  const { success, callId, raw } = await provider.runTestCall(
    client.voice_provider_account_id,
    callTo
  );

  return {
    stepKey:       STEP_KEY,
    clientUpdates: {},
    eventPayload: {
      step:    STEP_KEY,
      callTo,
      callId,
      success,
      isClientIntroCall: !process.env.TEST_CALL_NUMBER,
      _raw:    raw,
    },
  };
}

module.exports = { runTestCall, STEP_KEY };
