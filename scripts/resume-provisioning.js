'use strict';
// Resume a provisioning run that PAUSED for the manual number step, after you've
// bought + attached the number in the Trillet dashboard.
//   node --env-file=.env scripts/resume-provisioning.js <clientId> <+E164number>
//
// Records the number, then resumes the pipeline (provision_number proceeds,
// run_test_call, activate -> status 'live').

const { Pool } = require('pg');
const { runOnboarding } = require('../onboarding/src/index');
const { TrilletVoiceProvider } = require('../voice-provider/src/trillet.provider');

async function main() {
  const clientId = process.argv[2];
  const number   = process.argv[3];
  if (!clientId || !number || !number.startsWith('+')) {
    console.error('Usage: node --env-file=.env scripts/resume-provisioning.js <clientId> <+E164number>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [c] } = await pool.query(
    'SELECT id, business_name, status FROM clients WHERE id=$1', [clientId]);
  if (!c) { console.error('Client not found'); await pool.end(); process.exit(1); }

  await pool.query('UPDATE clients SET provisioned_number=$2 WHERE id=$1', [clientId, number]);
  console.log(`Recorded ${number} for ${c.business_name}. Resuming pipeline...`);

  const provider = new TrilletVoiceProvider();
  const { paused } = await runOnboarding(clientId, { db: pool, provider });

  const { rows: [a] } = await pool.query(
    'SELECT status, provisioned_number FROM clients WHERE id=$1', [clientId]);
  if (paused) {
    console.log('Still paused — the number may not have recorded; re-check and retry.');
  } else {
    console.log(`✓ Completed. status=${a.status}, number=${a.provisioned_number}`);
  }
  await pool.end();
}

main().catch(e => { console.error('RESUME ERROR:', e.message); process.exit(1); });
