'use strict';
// node --env-file=/var/www/aria/.env scripts/migrate-contractors-updated-at.js
//
// Adds the updated_at audit column the app writes to in several paths
// (telegram /start deep-link connect, onboarding step advances). Without it,
// `UPDATE contractors SET ... updated_at=NOW()` throws and the rep can't
// connect their Telegram account.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query(`
    ALTER TABLE contractors
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
  console.log('✓ contractors.updated_at added (default NOW())');

  console.log('\nMigration complete.');
  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
