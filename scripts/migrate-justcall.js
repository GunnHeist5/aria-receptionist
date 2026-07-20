'use strict';
// Migration for the JustCall integration (call-log sync + verified extraction).
//   node --env-file=.env scripts/migrate-justcall.js
//
// - justcall_calls: idempotency ledger — one row per JustCall call id, the
//   source of truth rep_activity daily rollups are derived from. Re-running the
//   sync can never double-count (PK on justcall id).
// - contractors.justcall_agent_id: robust rep mapping (auto-linked by email).
// - call_outcomes: who_answered / heard_ai_before (new extractor fields) and
//   justcall_call_id (unique → the AI webhook can't insert twice per call).

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS justcall_calls (
      id            BIGINT PRIMARY KEY,          -- JustCall call id
      agent_id      INT,
      agent_email   TEXT,
      contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
      contact_number TEXT,
      direction     TEXT,
      call_type     TEXT,                        -- answered/unanswered/missed/voicemail/…
      disposition   TEXT,
      duration_sec  INT DEFAULT 0,               -- conversation seconds (best available field)
      is_connect    BOOLEAN DEFAULT false,       -- our funnel definition, computed at sync
      call_at       TIMESTAMPTZ,
      synced_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS justcall_calls_contractor_date_idx ON justcall_calls (contractor_id, call_at)`);

  await pool.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS justcall_agent_id INT`);

  // The rollup's ON CONFLICT sets updated_at, but migrate-sales-manager.js
  // creates rep_activity without it (prod has it from an ad-hoc ALTER — this
  // guarantees it everywhere; same drift class as migrate-contractors-updated-at).
  await pool.query(`ALTER TABLE rep_activity ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

  await pool.query(`ALTER TABLE call_outcomes ADD COLUMN IF NOT EXISTS who_answered TEXT`);
  await pool.query(`ALTER TABLE call_outcomes ADD COLUMN IF NOT EXISTS heard_ai_before TEXT`);
  await pool.query(`ALTER TABLE call_outcomes ADD COLUMN IF NOT EXISTS justcall_call_id BIGINT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS call_outcomes_justcall_id_idx ON call_outcomes (justcall_call_id) WHERE justcall_call_id IS NOT NULL`);

  console.log('✓ justcall_calls table, contractors.justcall_agent_id, call_outcomes columns ready');
  await pool.end();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
