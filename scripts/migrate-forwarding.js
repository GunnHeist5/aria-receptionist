'use strict';
// node --env-file=/var/www/aria/.env scripts/migrate-forwarding.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS carrier              TEXT,
      ADD COLUMN IF NOT EXISTS carrier_name         TEXT,
      ADD COLUMN IF NOT EXISTS forwarding_confirmed      BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS forwarding_confirmed_at   TIMESTAMPTZ
  `);
  console.log('✓ clients: carrier, carrier_name, forwarding_confirmed, forwarding_confirmed_at');

  await pool.query(`
    CREATE INDEX IF NOT EXISTS clients_forwarding_idx
      ON clients (forwarding_confirmed, status)
  `);
  console.log('✓ index: clients_forwarding_idx');

  console.log('\nMigration complete.');
  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
