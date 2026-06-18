'use strict';

/**
 * @fileoverview Onboarding pipeline runner.
 *
 * Takes a client from status='won' to status='live' in five resumable steps.
 * The pipeline is checkpointed at each step — if it fails mid-run, calling
 * runPipeline again will skip already-completed steps and resume from the
 * last failure point.
 *
 * Flow:
 *   1. create_account     — create voice provider sub-account
 *   2. provision_number   — buy and assign a phone number
 *   3. apply_content_pack — push prompt + personality config to the agent
 *   4. run_test_call      — verify the agent picks up (skips if TEST_CALL_NUMBER unset)
 *   5. activate           — set status='live', mark billing_status='pending'
 *
 * DB contract:
 *   Reads:   clients, onboarding_runs
 *   Writes:  clients (voice_provider*, provisioned_number, content_pack_version, status, …)
 *            onboarding_runs (status, current_step, steps_completed, error, completed_at)
 *            events (type='provisioning_step' for every step success or failure)
 *
 * Error contract:
 *   All voice-provider errors surface as VoiceProviderError.
 *   The pipeline catches every step error, writes a provisioning_step failure event,
 *   marks the run 'failed', then re-throws so the caller knows.
 *   NEVER writes a payment_failed event — that type is Stripe/billing territory.
 */

const { VoiceProviderError }  = require('../../voice-provider/src/interface');
const { createAccount }       = require('./steps/01-create-account');
const { provisionNumber }     = require('./steps/02-provision-number');
const { applyContentPack }    = require('./steps/03-apply-content-pack');
const { runTestCall }         = require('./steps/04-run-test-call');
const { activate }            = require('./steps/05-activate');

/**
 * @typedef {Object} StepResult
 * @property {string}   stepKey
 * @property {object}   clientUpdates   — fields to merge into clients row (may be {})
 * @property {object}   eventPayload    — merged into events.payload under the step key
 * @property {boolean}  [skipped]       — true if step was bypassed intentionally
 * @property {string}   [skipReason]    — human-readable reason for the skip
 */

/** Step registry — order is execution order. */
const STEPS = [
  { key: 'create_account',    fn: createAccount    },
  { key: 'provision_number',  fn: provisionNumber  },
  { key: 'apply_content_pack', fn: applyContentPack },
  { key: 'run_test_call',     fn: runTestCall       },
  { key: 'activate',          fn: activate          },
];

// ---------------------------------------------------------------------------
// DB helpers (all queries in one place — easy to audit and mock in tests)
// ---------------------------------------------------------------------------

async function dbGetClient(db, clientId) {
  const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [clientId]);
  if (!rows.length) throw new Error(`[onboarding] client not found: ${clientId}`);
  return rows[0];
}

async function dbGetLatestRun(db, clientId) {
  const { rows } = await db.query(
    `SELECT * FROM onboarding_runs
     WHERE client_id = $1
     ORDER BY started_at DESC LIMIT 1`,
    [clientId]
  );
  return rows[0] || null;
}

async function dbCreateRun(db, clientId) {
  const { rows } = await db.query(
    `INSERT INTO onboarding_runs (client_id, status, steps_completed)
     VALUES ($1, 'running', '[]'::jsonb)
     RETURNING *`,
    [clientId]
  );
  return rows[0];
}

async function dbResetRunToRunning(db, runId) {
  await db.query(
    `UPDATE onboarding_runs SET status = 'running', error = null WHERE id = $1`,
    [runId]
  );
}

/** Merge clientUpdates into the clients row. Skips if updates is empty. */
async function dbUpdateClient(db, clientId, updates) {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  await db.query(
    `UPDATE clients SET ${setClauses} WHERE id = $1`,
    [clientId, ...entries.map(([, v]) => v)]
  );
}

/** Write a provisioning_step event. Never payment_failed — see interface contract. */
async function dbWriteEvent(db, clientId, payload) {
  await db.query(
    `INSERT INTO events (client_id, type, payload) VALUES ($1, 'provisioning_step', $2)`,
    [clientId, JSON.stringify(payload)]
  );
}

/** Append stepKey to steps_completed and update current_step. */
async function dbMarkStepComplete(db, runId, stepKey) {
  await db.query(
    `UPDATE onboarding_runs
     SET steps_completed = steps_completed || $2::jsonb,
         current_step    = $3
     WHERE id = $1`,
    [runId, JSON.stringify([stepKey]), stepKey]
  );
}

async function dbMarkRunFailed(db, runId, stepKey, errorMsg) {
  await db.query(
    `UPDATE onboarding_runs
     SET status       = 'failed',
         current_step = $2,
         error        = $3
     WHERE id = $1`,
    [runId, stepKey, errorMsg]
  );
}

async function dbMarkRunCompleted(db, runId, finalStepKey) {
  await db.query(
    `UPDATE onboarding_runs
     SET status       = 'completed',
         current_step = $2,
         completed_at = now()
     WHERE id = $1`,
    [runId, finalStepKey]
  );
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

/**
 * Run the onboarding pipeline for a single client.
 * Resumes automatically if a previous run was interrupted.
 *
 * @param {string} clientId
 * @param {{
 *   db:       object,  — pg.Pool or MemDb (anything with .query(sql, params))
 *   provider: import('../../voice-provider/src/interface').VoiceProvider
 * }} opts
 * @returns {Promise<{ runId: string }>}
 * @throws if any pipeline step fails after writing the failure event + marking run 'failed'
 */
async function runPipeline(clientId, { db, provider }) {
  // ── 1. Load client ──────────────────────────────────────────────────────
  let client = await dbGetClient(db, clientId);

  // ── 2. Guards ────────────────────────────────────────────────────────────
  const BLOCKED = new Set(['live', 'paused', 'churned']);
  if (BLOCKED.has(client.status)) {
    throw new Error(
      `[onboarding] cannot run pipeline: client ${clientId} has status '${client.status}'`
    );
  }

  // ── 3. Load or create onboarding_run ────────────────────────────────────
  let run = await dbGetLatestRun(db, clientId);

  if (!run) {
    run = await dbCreateRun(db, clientId);
  } else if (run.status === 'completed') {
    throw new Error(
      `[onboarding] onboarding already completed for client ${clientId} (run ${run.id}). ` +
      'If you need to re-provision, deprovision the client first.'
    );
  } else if (run.status === 'failed') {
    await dbResetRunToRunning(db, run.id);
    run.status          = 'running';
    run.error           = null;
  }

  const completedSteps = new Set(
    Array.isArray(run.steps_completed) ? run.steps_completed : []
  );

  // ── 4. Execute steps ─────────────────────────────────────────────────────
  let lastKey = null;
  for (const { key, fn } of STEPS) {
    if (completedSteps.has(key)) {
      process.stdout.write(`[onboarding]   skip   ${key} (checkpoint)\n`);
      lastKey = key;
      continue;
    }

    process.stdout.write(`[onboarding]   run    ${key}\n`);

    try {
      // Re-read client before each step so it sees previous steps' writes.
      client = await dbGetClient(db, clientId);

      const result = await fn({ client, provider });

      // Write result to DB
      await dbUpdateClient(db, clientId, result.clientUpdates);
      await dbWriteEvent(db, clientId,
        result.skipped
          ? { step: key, skipped: true, reason: result.skipReason }
          : { step: key, ...result.eventPayload }
      );
      await dbMarkStepComplete(db, run.id, key);
      lastKey = key;

      if (result.skipped) {
        process.stdout.write(`[onboarding]   skip   ${key}: ${result.skipReason}\n`);
      } else {
        process.stdout.write(`[onboarding]   done   ${key}\n`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`[onboarding]   FAILED ${key}: ${msg}\n`);

      await dbWriteEvent(db, clientId, {
        step:   key,
        status: 'failed',
        error:  msg,
        ...(err instanceof VoiceProviderError ? { providerMethod: err.method } : {}),
      });
      await dbMarkRunFailed(db, run.id, key, msg);
      throw err;
    }
  }

  // ── 5. Mark run completed ────────────────────────────────────────────────
  await dbMarkRunCompleted(db, run.id, lastKey || STEPS[STEPS.length - 1].key);
  process.stdout.write(`[onboarding] pipeline complete for client ${clientId}\n`);

  return { runId: run.id };
}

module.exports = { runPipeline, STEPS };
