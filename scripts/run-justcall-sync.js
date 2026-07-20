'use strict';
// Manual JustCall sync run + verification readout.
//   node --env-file=.env scripts/run-justcall-sync.js
// Prints the sync summary, then the per-rep daily numbers now in rep_activity
// and the raw ledger rows — compare these against the JustCall dashboard.

const { Pool } = require('pg');
const { runJustcallSync } = require('../sales-manager/workers/justcall-sync');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const summary = await runJustcallSync(pool);
  console.log('SYNC SUMMARY:', JSON.stringify(summary, null, 2));

  const { rows: activity } = await pool.query(`
    SELECT ct.name AS rep, a.date, a.dials, a.connects, a.demos
    FROM rep_activity a JOIN contractors ct ON ct.id = a.contractor_id
    WHERE a.date > CURRENT_DATE - 7 ORDER BY a.date DESC, ct.name
  `);
  console.log('\nREP_ACTIVITY (what /stats reads now):');
  console.table(activity);

  const { rows: ledger } = await pool.query(`
    SELECT id, agent_email, contact_number, direction, call_type, duration_sec, is_connect, call_at
    FROM justcall_calls ORDER BY call_at DESC LIMIT 15
  `);
  console.log('LEDGER (most recent 15 raw calls):');
  console.table(ledger);

  await pool.end();
}

main().catch(e => { console.error('Sync failed:', e.message); process.exit(1); });
