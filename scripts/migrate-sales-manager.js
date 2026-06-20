'use strict';
// node --env-file=/var/www/aria/.env scripts/migrate-sales-manager.js
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await p.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                TEXT NOT NULL,
      email               TEXT NOT NULL,
      phone               TEXT,
      source              TEXT NOT NULL DEFAULT 'direct',
      status              TEXT NOT NULL DEFAULT 'applied',
      application_text    TEXT,
      submission_url      TEXT,
      transcript          TEXT,
      score               INT,
      score_breakdown     JSONB,
      llm_reasoning       TEXT,
      hire_recommendation TEXT,
      approved_by_human   BOOLEAN,
      approved_at         TIMESTAMPTZ,
      offer_sent_at       TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ candidates');

  await p.query(`
    ALTER TABLE contractors
      ADD COLUMN IF NOT EXISTS candidate_id         UUID REFERENCES candidates(id),
      ADD COLUMN IF NOT EXISTS contract_document_id TEXT,
      ADD COLUMN IF NOT EXISTS contract_signed_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS onboarding_status    TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS channel_type         TEXT NOT NULL DEFAULT 'telegram',
      ADD COLUMN IF NOT EXISTS channel_id           TEXT,
      ADD COLUMN IF NOT EXISTS lead_list_token      TEXT,
      ADD COLUMN IF NOT EXISTS last_active_at       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS active               BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS offboarded_at        TIMESTAMPTZ
  `);
  console.log('✓ contractors extended');

  await p.query(`
    CREATE TABLE IF NOT EXISTS rep_activity (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id UUID NOT NULL REFERENCES contractors(id),
      date          DATE NOT NULL DEFAULT CURRENT_DATE,
      dials         INT NOT NULL DEFAULT 0,
      connects      INT NOT NULL DEFAULT 0,
      demos         INT NOT NULL DEFAULT 0,
      closes        INT NOT NULL DEFAULT 0,
      source        TEXT NOT NULL DEFAULT 'manual',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (contractor_id, date)
    )
  `);
  console.log('✓ rep_activity');

  await p.query(`
    CREATE TABLE IF NOT EXISTS rep_metrics (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id  UUID NOT NULL REFERENCES contractors(id),
      period_type    TEXT NOT NULL,
      period_start   DATE NOT NULL,
      period_end     DATE NOT NULL,
      total_dials    INT NOT NULL DEFAULT 0,
      total_connects INT NOT NULL DEFAULT 0,
      total_demos    INT NOT NULL DEFAULT 0,
      total_closes   INT NOT NULL DEFAULT 0,
      connect_rate   NUMERIC(5,2),
      demo_rate      NUMERIC(5,2),
      close_rate     NUMERIC(5,2),
      mrr_generated  NUMERIC(10,2) DEFAULT 0,
      health_status  TEXT NOT NULL DEFAULT 'green',
      flags          JSONB NOT NULL DEFAULT '[]',
      computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ rep_metrics');

  await p.query(`
    CREATE TABLE IF NOT EXISTS coaching_sessions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id    UUID NOT NULL REFERENCES contractors(id),
      trigger          TEXT NOT NULL,
      input_snapshot   JSONB,
      diagnosis        TEXT,
      coaching_content TEXT,
      internal_notes   TEXT,
      action_taken     TEXT,
      sent_at          TIMESTAMPTZ,
      contractor_reply TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ coaching_sessions');

  await p.query(`
    CREATE TABLE IF NOT EXISTS offboarding_proposals (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contractor_id     UUID NOT NULL REFERENCES contractors(id),
      reasoning         TEXT NOT NULL,
      re_engagement_log JSONB NOT NULL DEFAULT '[]',
      activity_summary  JSONB,
      proposed_message  TEXT,
      status            TEXT NOT NULL DEFAULT 'pending',
      proposed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      human_decided_at  TIMESTAMPTZ,
      human_decision    TEXT,
      executed_at       TIMESTAMPTZ
    )
  `);
  console.log('✓ offboarding_proposals');

  await p.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type   TEXT NOT NULL,
      entity_id     UUID,
      action        TEXT NOT NULL,
      data_snapshot JSONB,
      llm_reasoning TEXT,
      outcome       JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ audit_log');

  await p.query(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category       TEXT NOT NULL,
      title          TEXT NOT NULL,
      content        TEXT NOT NULL,
      is_placeholder BOOLEAN NOT NULL DEFAULT false,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ knowledge_base');

  console.log('\nMigration complete.');
  await p.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
