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
  const testNumber = process.env.TEST_CALL_NUMBER;

  if (!testNumber) {
    return {
      stepKey:       STEP_KEY,
      clientUpdates: {},
      eventPayload:  {},
      skipped:       true,
      skipReason:    'TEST_CALL_NUMBER not configured — test call skipped',
    };
  }

  const { success, callId, raw } = await provider.runTestCall(
    client.voice_provider_account_id,
    testNumber
  );

  return {
    stepKey:       STEP_KEY,
    clientUpdates: {},
    eventPayload:  { step: STEP_KEY, testNumber, callId, success, _raw: raw },
  };
}

module.exports = { runTestCall, STEP_KEY };
