'use strict';
// node --env-file=/var/www/aria/.env scripts/migrate-business-types.js
//
// Adds 'hvac' and 'combined' to the business_type Postgres ENUM.
// Safe to re-run: IF NOT EXISTS means no error if already present.
// Must run before deploying HVAC / combined client support.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('Adding hvac and combined to business_type enum…');

  // ALTER TYPE ADD VALUE cannot run inside a transaction block
  await pool.query(`ALTER TYPE business_type ADD VALUE IF NOT EXISTS 'hvac'`);
  console.log("  ✓ business_type += 'hvac'");

  await pool.query(`ALTER TYPE business_type ADD VALUE IF NOT EXISTS 'combined'`);
  console.log("  ✓ business_type += 'combined'");

  // Confirm all three values are present
  const { rows } = await pool.query(`
    SELECT enumlabel AS value
    FROM pg_enum
    WHERE enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'business_type'
    )
    ORDER BY enumsortorder
  `);
  console.log('\nCurrent business_type enum values:', rows.map(r => r.value).join(', '));
  console.log('\nDone. HVAC and combined clients can now be inserted.');

  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
