'use strict';

/**
 * Integration test — runs the onboarding pipeline against real Neon Postgres.
 * MockVoiceProvider only — no Trillet account needed.
 *
 * Tests:
 *   1. Happy path  — client A runs all five steps from won → live
 *   2. Failure     — client B fails at provision_number; run is marked failed
 *   3. Resume      — same client B retries; skips done steps; completes to live
 *
 * Leaves both clients in the DB with source='integration_test' so you can
 * inspect them directly. Re-running cleans up the previous run first.
 */

const path = require('path');

// Load Neon credentials — must happen before any module that reads DATABASE_URL
require('dotenv').config({ path: path.join(__dirname, '../ai-receptionist-db/.env') });

// Tell step 01 what to write into clients.voice_provider
process.env.VOICE_PROVIDER = 'mock';

// pg lives in ai-receptionist-db; use path.join so __dirname resolves to Windows format
const { Pool } = require(path.join(__dirname, '../ai-receptionist-db/node_modules/pg'));
const { MockVoiceProvider } = require('../voice-provider/src/mock.provider');
const { runOnboarding }      = require('./src/index');

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const HR = '─'.repeat(66);

function banner(title) {
  console.log(`\n${HR}`);
  console.log(` ${title}`);
  console.log(HR);
}

function printClient(label, c) {
  console.log(`\n  ${label}`);
  if (!c) { console.log('    (not found)'); return; }
  console.log(`    status:                    ${c.status}`);
  console.log(`    voice_provider:            ${c.voice_provider            ?? 'null'}`);
  console.log(`    voice_provider_account_id: ${c.voice_provider_account_id ?? 'null'}`);
  console.log(`    provisioned_number:        ${c.provisioned_number        ?? 'null'}`);
  console.log(`    content_pack_version:      ${c.content_pack_version      ?? 'null'}`);
  console.log(`    billing_status:            ${c.billing_status}`);
  console.log(`    activated_at:              ${c.activated_at              ?? 'null'}`);
  if (c.provisioning_checkpoint) {
    console.log(`    provisioning_checkpoint:   ${JSON.stringify(c.provisioning_checkpoint)}`);
  }
}

function printRuns(label, runs) {
  console.log(`\n  ${label}  (${runs.length} row${runs.length !== 1 ? 's' : ''})`);
  for (const r of runs) {
    console.log(`    ┌ id:              ${r.id}`);
    console.log(`    │ status:          ${r.status}`);
    console.log(`    │ current_step:    ${r.current_step ?? 'null'}`);
    console.log(`    │ steps_completed: [${(r.steps_completed || []).join(', ')}]`);
    console.log(`    │ error:           ${r.error         ?? 'none'}`);
    console.log(`    └ completed_at:    ${r.completed_at  ?? 'null'}`);
  }
}

function printEvents(label, events) {
  console.log(`\n  ${label}  (${events.length} event${events.length !== 1 ? 's' : ''})`);
  for (const e of events) {
    const p    = e.payload || {};
    const tag  = p.status === 'failed' ? ' ✗ FAILED'
               : p.skipped             ? ' → SKIPPED'
               :                         ' ✓';
    const note = p.status === 'failed' ? `  error: ${p.error}` : '';
    console.log(`    ${tag}  ${p.step}${note}`);
  }
}

// ---------------------------------------------------------------------------
// DB query helpers
// ---------------------------------------------------------------------------

async function getClient(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, business_name, status,
            voice_provider, voice_provider_account_id,
            provisioned_number, content_pack_version,
            billing_status, activated_at, provisioning_checkpoint
     FROM clients WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

async function getRuns(pool, clientId) {
  const { rows } = await pool.query(
    `SELECT id, status, current_step, steps_completed, error, started_at, completed_at
     FROM onboarding_runs WHERE client_id = $1 ORDER BY started_at`,
    [clientId]
  );
  return rows;
}

async function getEvents(pool, clientId) {
  const { rows } = await pool.query(
    `SELECT type, payload, created_at
     FROM events WHERE client_id = $1 AND type = 'provisioning_step'
     ORDER BY created_at`,
    [clientId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Confirm connectivity
    const { rows: [{ db, v }] } = await pool.query(
      `SELECT current_database() AS db, split_part(version(), ' ', 2) AS v`
    );
    console.log(`\nConnected: ${db} (Postgres ${v})`);

    // ── Clean up any previous integration test clients ────────────────────
    await pool.query(`DELETE FROM clients WHERE source = 'integration_test'`);
    // onboarding_runs cascade; events SET NULL; commissions RESTRICT (none exist)
    console.log('Cleaned up previous integration_test clients.');

    // ── Insert Client A (happy path) ──────────────────────────────────────
    const { rows: [cA] } = await pool.query(`
      INSERT INTO clients (
        status, business_name, business_type, phone, email,
        city, state, zip, fit_score, tier, source,
        forward_to_number, tone, business_hours, services_offered,
        service_area, do_not_say, escalation_keywords,
        after_hours_behavior, alert_destination
      ) VALUES (
        'won', 'Greenfield Plumbing (Integration A)', 'plumbing',
        '+15125550101', 'ops@greenfield-a.example',
        'Austin', 'TX', '78701', 89, 'A', 'integration_test',
        '+15125550199', 'professional',
        '{"mon-fri":"08:00-17:00","sat":"09:00-13:00"}'::jsonb,
        ARRAY['drain cleaning','leak repair','water heaters'],
        '{"radius_miles":20}'::jsonb,
        '["cheapest in town"]'::jsonb,
        '["burst pipe","flooding","gas leak"]'::jsonb,
        'voicemail',
        '{"sms":["+15125550101"]}'::jsonb
      ) RETURNING id, business_name
    `);

    // ── Insert Client B (failure/resume) ──────────────────────────────────
    const { rows: [cB] } = await pool.query(`
      INSERT INTO clients (
        status, business_name, business_type, phone, email,
        city, state, zip, fit_score, tier, source,
        forward_to_number, tone, business_hours, services_offered,
        service_area, do_not_say, escalation_keywords,
        after_hours_behavior, alert_destination
      ) VALUES (
        'won', 'Ridgeline Drain Co (Integration B)', 'plumbing',
        '+17135550102', 'ops@ridgeline-b.example',
        'Houston', 'TX', '77001', 93, 'A', 'integration_test',
        '+17135550299', 'friendly',
        '{"mon-fri":"07:00-18:00"}'::jsonb,
        ARRAY['sewer repair','hydro jetting'],
        '{"radius_miles":30}'::jsonb,
        '[]'::jsonb,
        '["sewage backup","no water"]'::jsonb,
        'emergency_only',
        '{"sms":["+17135550102"]}'::jsonb
      ) RETURNING id, business_name
    `);

    console.log(`\nInserted:`);
    console.log(`  Client A: ${cA.id}  ${cA.business_name}`);
    console.log(`  Client B: ${cB.id}  ${cB.business_name}`);

    // ════════════════════════════════════════════════════════════════════════
    // 1. HAPPY PATH — Client A
    // ════════════════════════════════════════════════════════════════════════
    banner('1. HAPPY PATH — Client A  (won → live, all five steps)');

    printClient('DB BEFORE', await getClient(pool, cA.id));
    printRuns('onboarding_runs BEFORE', await getRuns(pool, cA.id));

    console.log('\n  Running pipeline...\n');
    const mockA = new MockVoiceProvider();
    delete process.env.TEST_CALL_NUMBER; // step 4 skips gracefully
    await runOnboarding(cA.id, { db: pool, provider: mockA });

    printClient('DB AFTER', await getClient(pool, cA.id));
    printRuns('onboarding_runs AFTER', await getRuns(pool, cA.id));
    printEvents('events written', await getEvents(pool, cA.id));

    // ════════════════════════════════════════════════════════════════════════
    // 2. FAILURE — Client B, fail at provision_number
    // ════════════════════════════════════════════════════════════════════════
    banner('2. FAILURE — Client B  (pipeline fails at provision_number)');

    const mockB = new MockVoiceProvider();
    mockB.failOn.add('provisionNumber');

    printClient('DB BEFORE first attempt', await getClient(pool, cB.id));

    console.log('\n  Running pipeline (provisionNumber will throw)...\n');
    try {
      await runOnboarding(cB.id, { db: pool, provider: mockB });
    } catch (err) {
      console.log(`\n  → Caught expected error: ${err.message}`);
    }

    printClient('DB AFTER failure', await getClient(pool, cB.id));
    printRuns('onboarding_runs after failure', await getRuns(pool, cB.id));
    printEvents('events after failure', await getEvents(pool, cB.id));

    // ════════════════════════════════════════════════════════════════════════
    // 3. RESUME — Client B, clear failOn and retry
    // ════════════════════════════════════════════════════════════════════════
    banner('3. RESUME — Client B  (clear failOn, retry from checkpoint)');

    mockB.failOn.delete('provisionNumber');
    console.log('  Cleared failOn.provisionNumber\n');
    console.log('  Running pipeline again (will skip create_account, resume from provision_number)...\n');
    await runOnboarding(cB.id, { db: pool, provider: mockB });

    printClient('DB AFTER resume', await getClient(pool, cB.id));
    printRuns('onboarding_runs after resume', await getRuns(pool, cB.id));
    printEvents('all events (full run)', await getEvents(pool, cB.id));

    // ════════════════════════════════════════════════════════════════════════
    // Checkpoint deep-dive
    // ════════════════════════════════════════════════════════════════════════
    banner('CHECKPOINT VERIFICATION');

    const { rows: [cpA] } = await pool.query(
      `SELECT provisioning_checkpoint FROM clients WHERE id = $1`, [cA.id]
    );
    const { rows: [cpB] } = await pool.query(
      `SELECT provisioning_checkpoint FROM clients WHERE id = $1`, [cB.id]
    );
    console.log('\n  Client A  provisioning_checkpoint:');
    console.log('    ' + JSON.stringify(cpA.provisioning_checkpoint));
    console.log('\n  Client B  provisioning_checkpoint:');
    console.log('    ' + JSON.stringify(cpB.provisioning_checkpoint));

    // ════════════════════════════════════════════════════════════════════════
    // Provider call log (proves createSubAccount called only once for B)
    // ════════════════════════════════════════════════════════════════════════
    banner('MOCK PROVIDER CALL LOG — Client B');
    console.log(`\n  ${mockB.calls.length} total calls across both attempts:`);
    for (const c of mockB.calls) {
      const tag = c.error ? '✗' : '✓';
      console.log(`  ${tag}  ${c.method}`);
    }
    const createCalls = mockB.calls.filter(c => c.method === 'createSubAccount');
    console.log(`\n  createSubAccount called ${createCalls.length}x (should be 1 — checkpoint skipped re-run)`);

    // ════════════════════════════════════════════════════════════════════════
    // Summary
    // ════════════════════════════════════════════════════════════════════════
    banner('SUMMARY');
    const finalA = await getClient(pool, cA.id);
    const finalB = await getClient(pool, cB.id);
    console.log(`\n  Client A  ${finalA.status.padEnd(13)} billing=${finalA.billing_status.padEnd(8)} number=${finalA.provisioned_number}`);
    console.log(`  Client B  ${finalB.status.padEnd(13)} billing=${finalB.billing_status.padEnd(8)} number=${finalB.provisioned_number}`);
    console.log('\n  ✓ Integration test complete.\n');

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('\nINTEGRATION TEST FAILED:', err.message);
  process.exit(1);
});
