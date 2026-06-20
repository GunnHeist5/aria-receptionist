'use strict';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS onboarding_step INT NOT NULL DEFAULT 0`);
  console.log('✓ contractors.onboarding_step');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS objections (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
      description   TEXT NOT NULL,
      category      TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ objections');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS script_proposals (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      week_start   DATE NOT NULL,
      top_objections JSONB,
      proposed_script_update TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      approved_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ script_proposals');

  console.log('\nMigration complete.');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
