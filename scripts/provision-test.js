'use strict';
/**
 * One-shot test provisioning for Murphy's Plumbing.
 *
 * Usage:
 *   node --env-file=/var/www/aria/.env scripts/provision-test.js +1YOURNUMBER
 *
 * What it does:
 *   1. Inserts a test Murphy's Plumbing client into the DB
 *   2. Runs the full onboarding pipeline (Trillet agent → number purchase → attach → content pack)
 *   3. AI calls your number from the new AI number so you can hear it and see the number on caller ID
 *   4. Prints the provisioned number
 *
 * To clean up afterward:
 *   node --env-file=/var/www/aria/.env scripts/provision-test.js --cleanup
 */

const { Pool }          = require('pg');
const { runOnboarding } = require('../onboarding/src/index');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Cleanup mode ────────────────────────────────────────────────────────────
if (process.argv[2] === '--cleanup') {
  pool.query(`DELETE FROM clients WHERE source = 'test' AND business_name = $1`, ["Murphy's Plumbing"])
    .then(r => { console.log(`Deleted ${r.rowCount} test client(s).`); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(() => pool.end());
  return;
}

// ── Provision ────────────────────────────────────────────────────────────────
const forwardTo = process.argv[2];
if (!forwardTo || !forwardTo.startsWith('+')) {
  console.error('Usage: node --env-file=/var/www/aria/.env scripts/provision-test.js +1YOURNUMBER');
  console.error('Example: node --env-file=/var/www/aria/.env scripts/provision-test.js +12155550199');
  process.exit(1);
}

async function main() {
  console.log(`\n[test-provision] Creating Murphy's Plumbing test client...`);
  console.log(`[test-provision] AI will call ${forwardTo} when live.\n`);

  const { rows: [client] } = await pool.query(`
    INSERT INTO clients (
      status, billing_status,
      business_name, business_type, phone, forward_to_number,
      city, state, zip, tone,
      services_offered, escalation_keywords, do_not_say,
      after_hours_behavior, business_hours, service_area,
      alert_destination, pricing_notes,
      fit_score, tier, source
    ) VALUES (
      'won', 'active',
      $1, 'plumbing', '+12155550100', $2,
      'Philadelphia', 'PA', '19101', 'professional',
      $3, $4, '[]'::jsonb,
      'voicemail', '{"mon-fri":"08:00-17:00"}'::jsonb, '{"radius_miles":25,"areaCode":"215"}'::jsonb,
      '{}'::jsonb, 'Emergency call fee: $150. Drain cleaning: $95–150. Water heater install: $800–1200.',
      85, 'A', 'test'
    ) RETURNING id, business_name
  `, [
    "Murphy's Plumbing",
    forwardTo,
    JSON.stringify(['Drain cleaning', 'Leak repair', 'Water heaters', 'Emergency plumbing', 'Pipe installation']),
    JSON.stringify(['burst pipe', 'flooding', 'gas leak', 'sewage backup', 'no hot water']),
  ]);

  console.log(`[test-provision] Client created: ${client.business_name} (${client.id})`);

  try {
    const { runId } = await runOnboarding(client.id, { db: pool });

    const { rows: [fresh] } = await pool.query(
      'SELECT provisioned_number FROM clients WHERE id = $1', [client.id]
    );

    console.log(`\n✅ Provisioning complete! (run ${runId})`);
    console.log(`\n📞 AI number: ${fresh.provisioned_number}`);
    console.log(`   → Calling ${forwardTo} now — pick up to hear the AI.`);
    console.log(`\nTo clean up: node --env-file=/var/www/aria/.env scripts/provision-test.js --cleanup`);
  } catch (err) {
    console.error(`\n✗ Provisioning failed: ${err.message}`);
    await pool.query(`UPDATE clients SET status = 'failed' WHERE id = $1`, [client.id]);
    console.error(`Client left in DB with status='failed' (id: ${client.id}) for debugging.`);
    process.exit(1);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
