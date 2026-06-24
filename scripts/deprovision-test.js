'use strict';
// Tear down a TEST client's Trillet resources (agent + call flow) and delete the
// test client row. Guarded so it only runs on test clients.
//   node --env-file=.env scripts/deprovision-test.js <clientId> --yes
//
// NOTE: if you manually bought a number in the dashboard, RELEASE it there too —
// Trillet free-plan numbers can't always be released via API.

const { Pool } = require('pg');
const { TrilletVoiceProvider } = require('../voice-provider/src/trillet.provider');

async function main() {
  const clientId  = process.argv[2];
  const confirmed = process.argv.includes('--yes');
  if (!clientId) { console.error('Usage: node --env-file=.env scripts/deprovision-test.js <clientId> --yes'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [c] } = await pool.query(
    'SELECT id, business_name, voice_provider_account_id, source FROM clients WHERE id=$1', [clientId]);
  if (!c) { console.error('Client not found'); await pool.end(); process.exit(1); }

  if (!['test', 'provision_test'].includes(c.source) && !/TEST/i.test(c.business_name)) {
    console.error(`SAFETY: ${c.business_name} does not look like a test client (source=${c.source}). Aborting.`);
    await pool.end(); process.exit(1);
  }

  console.log(`Deprovision ${c.business_name} — agent ${c.voice_provider_account_id || '(none)'}`);
  if (!confirmed) { console.log('Re-run with --yes to tear down + delete. Nothing done.'); await pool.end(); return; }

  if (c.voice_provider_account_id) {
    const provider = new TrilletVoiceProvider();
    const res = await provider.deprovision(c.voice_provider_account_id);
    console.log('Trillet deprovision success:', res.success);
  }
  await pool.query('DELETE FROM onboarding_runs WHERE client_id=$1', [clientId]);
  await pool.query('DELETE FROM events WHERE client_id=$1', [clientId]);
  await pool.query('DELETE FROM clients WHERE id=$1', [clientId]);
  console.log('✓ Test client deleted.');
  console.log('⚠️  If you bought a number in the dashboard, release it there to stop the ~$1/mo charge.');
  await pool.end();
}

main().catch(e => { console.error('DEPROVISION ERROR:', e.message); process.exit(1); });
