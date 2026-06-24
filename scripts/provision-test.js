'use strict';
// One controlled, REAL-Trillet test provision (manual-number flow).
//
//   node --env-file=.env scripts/provision-test.js +1YOURMOBILE [areaCode]
//
// Creates a labeled TEST plumbing client, then forces the REAL Trillet provider
// to create an agent + apply the content pack (call flow). The number is
// intentionally NOT auto-bought — API-key buys don't wire LiveKit inbound, so you
// buy + attach it in the Trillet dashboard, then call it to test inbound for real.
// Does NOT touch the live worker or the global VOICE_PROVIDER (still mock).
//
// Clean up afterward with: scripts/deprovision-test.js <clientId> --yes

const { Pool } = require('pg');
const { runOnboarding } = require('../onboarding/src/index');
const { TrilletVoiceProvider } = require('../voice-provider/src/trillet.provider');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const forwardTo = process.argv[2];
  const areaCode  = (process.argv[3] || '512').replace(/\D/g, '').slice(0, 3);
  if (!forwardTo || !forwardTo.startsWith('+')) {
    console.error('Usage: node --env-file=.env scripts/provision-test.js +1YOURMOBILE [areaCode]');
    process.exit(1);
  }

  console.log('This creates REAL Trillet resources: one agent + one call flow.');
  console.log('It will NOT buy a number (manual dashboard step) and will NOT place a call.');
  console.log(`Test client forwards to ${forwardTo}; target area code ${areaCode}.\n`);

  const { rows: [client] } = await pool.query(`
    INSERT INTO clients (
      status, billing_status, business_name, business_type, phone, forward_to_number,
      city, state, zip, tone, services_offered, escalation_keywords, do_not_say,
      after_hours_behavior, business_hours, service_area, alert_destination, pricing_notes,
      fit_score, tier, source
    ) VALUES (
      'won','active','TEST - Provisioning Check','plumbing','+1${areaCode}5550100',$1,
      'Austin','TX','78701','professional',$2,$3::jsonb,'[]'::jsonb,
      'voicemail','{"mon-fri":"08:00-17:00"}'::jsonb,$4::jsonb,'{}'::jsonb,'Standard rates',
      85,'A','test'
    ) RETURNING id, business_name
  `, [
    forwardTo,
    ['Drain cleaning', 'Leak repair', 'Water heaters', 'Emergency plumbing'],
    JSON.stringify(['burst pipe', 'flooding', 'gas leak', 'no hot water']),
    JSON.stringify({ radius_miles: 25, areaCode }),
  ]);
  console.log(`Test client created: ${client.business_name} (${client.id})`);

  try {
    const provider = new TrilletVoiceProvider();          // force Trillet for THIS run only
    const { runId } = await runOnboarding(client.id, { db: pool, provider });
    const { rows: [a] } = await pool.query(
      'SELECT voice_provider_account_id, content_pack_version, status FROM clients WHERE id=$1', [client.id]);

    console.log(`\n✅ Provisioned (run ${runId})`);
    console.log(`   Trillet agent id: ${a.voice_provider_account_id}`);
    console.log(`   Content pack:     ${a.content_pack_version}`);
    console.log(`   Client status:    ${a.status}`);
    console.log('\nNEXT (manual — this is the real inbound test):');
    console.log('   1. Trillet dashboard -> buy a number -> ATTACH it to the agent id above.');
    console.log('   2. Call that number from your phone. Confirm the AI answers and talks.');
    console.log(`   3. Tear down:  node --env-file=.env scripts/deprovision-test.js ${client.id} --yes`);
  } catch (err) {
    console.error(`\n✗ Provisioning failed: ${err.message}`);
    await pool.query(`UPDATE clients SET status='failed' WHERE id=$1`, [client.id]);
    console.error(`Test client left as status='failed' (id ${client.id}) for debugging.`);
    process.exit(1);
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
