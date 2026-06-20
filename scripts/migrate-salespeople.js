'use strict';
// Run: node --env-file=/var/www/aria/.env scripts/migrate-salespeople.js
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await p.query(`
    ALTER TABLE contractors
      ADD COLUMN IF NOT EXISTS name              TEXT,
      ADD COLUMN IF NOT EXISTS slug              TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS email             TEXT,
      ADD COLUMN IF NOT EXISTS intake_note       TEXT,
      ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW()
  `);
  console.log('contractors columns added');

  await p.query(`
    ALTER TABLE commissions
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ
  `);
  console.log('commissions.paid_at added');

  const { rows } = await p.query('SELECT COUNT(*) FROM contractors');
  console.log('existing contractors:', rows[0].count);
  await p.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
