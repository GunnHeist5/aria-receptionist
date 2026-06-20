'use strict';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_outcomes (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id     UUID REFERENCES contractors(id) ON DELETE SET NULL,
      is_owner          BOOLEAN NOT NULL DEFAULT false,
      business_name     TEXT,
      outcome           TEXT NOT NULL,
      primary_objection TEXT,
      demo_method       TEXT NOT NULL DEFAULT 'none',
      what_worked       TEXT,
      what_failed       TEXT,
      notes             TEXT,
      raw_quote         TEXT,
      logged_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ call_outcomes');

  await pool.query(`CREATE INDEX IF NOT EXISTS call_outcomes_logged_at_idx ON call_outcomes (logged_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS call_outcomes_contractor_idx ON call_outcomes (contractor_id)`);
  console.log('✓ indexes');

  console.log('\nMigration complete.');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
