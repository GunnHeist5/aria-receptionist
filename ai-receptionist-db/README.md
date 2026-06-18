# AI-Receptionist Platform — Database Spine

The single source of truth for the AI-receptionist agency platform. Every later
component (lead pipeline, onboarding automation, billing, monitoring, commissions)
reads from and writes to this database. It is meant to be operated by an
orchestrator that holds the keys and runs cron jobs.

**Stack:** Postgres + plain SQL migrations, with Node.js scripts (`node-postgres`)
for applying migrations, seeding, and verifying.

## Design principles

- **`clients` is a lifecycle record** — one row per business that travels from raw
  `lead` → `contacted` → `pilot` → `won` → `provisioning` → `live` → `paused` →
  `churned`, tracked by the `status` enum. Leads and clients are **not** split into
  separate tables.
- **Voice vendor is never hardcoded** — the schema stores `voice_provider` (text,
  e.g. `vapi`, `retell`, `twilio`) and `voice_provider_account_id`, so the vendor can
  be swapped without a schema change.
- **`jsonb` for flexible config** — `business_hours`, `alert_destination`,
  `do_not_say`, `escalation_keywords`, `service_area`, and provisioning state.
- **`events` is append-only** — the audit trail and monitoring substrate.
- **Onboarding is resumable** — `clients.provisioning_checkpoint` plus the
  `onboarding_runs` table (with `current_step` / `steps_completed`) support
  checkpointing.

## Tables

| Table | Purpose |
|---|---|
| `clients` | The spine — lifecycle record per business (sourcing, sales, config, provisioning, billing). |
| `contractors` | Sales reps who source/close clients and earn commissions. |
| `captured_leads` | Inbound calls the bot answered/captured for a client. |
| `events` | Append-only audit/monitoring trail. |
| `commissions` | Setup + residual commission ledger (financial history, never auto-deleted). |
| `onboarding_runs` | Resumable provisioning pipeline executions. |

### ON DELETE behavior
- `clients.contractor_id` → **SET NULL** (keep the client if a rep leaves).
- `events.client_id` → **SET NULL** (preserve the audit trail).
- `commissions.*` → **RESTRICT** (never lose financial history).
- `captured_leads.client_id` → **CASCADE** (call logs belong to the client).
- `onboarding_runs.client_id` → **CASCADE** (operational).

> Clients are normally retired by setting `status = 'churned'`, not hard-deleted.

### Adding a new business vertical
`business_type` is a real Postgres enum seeded with `plumbing`. Expand it without a
schema rewrite:
```sql
ALTER TYPE business_type ADD VALUE 'hvac';
```
(Put this in a new migration, e.g. `0002_add_hvac.sql`.)

## Prerequisites
- Node.js ≥ 18
- A reachable Postgres database (local or managed)

## Setup

```bash
# 1. install deps
npm install

# 2. configure the connection string
cp .env.example .env
#   then edit .env and set DATABASE_URL (and PGSSL=true for managed Postgres)
```

`DATABASE_URL` format:
```
postgres://USER:PASSWORD@HOST:PORT/DATABASE
```
Create the database first if it doesn't exist, e.g.:
```bash
createdb ai_receptionist
```

## Commands

| Command | What it does |
|---|---|
| `npm run migrate` | Applies pending SQL migrations from `migrations/` in order. Idempotent — tracks applied files in `schema_migrations`. |
| `npm run seed` | Inserts realistic sample data. Idempotent (fixed UUIDs + `ON CONFLICT DO NOTHING`). |
| `npm run verify` | Connects, confirms all tables + enums exist, runs representative queries, prints results. Exits non-zero if anything structural is missing. |
| `npm run setup` | Runs migrate → seed → verify in sequence. |

Typical first run:
```bash
npm install
cp .env.example .env   # edit DATABASE_URL
npm run setup
```

## What `verify` checks
- Connectivity + Postgres version.
- All 6 tables and all 11 enums are present.
- Row counts per table.
- Representative queries:
  - all `live` clients (with provider, number, MRR, billing status),
  - a contractor's `accrued` commissions,
  - recent failure events (`payment_failed`, `call_forward_failure`),
  - the pipeline broken down by `status`.

## Seed data shape
- **2 contractors** (Dana Reyes, Marcus Lee).
- **5 clients**: 2 raw leads, 1 pilot, 1 fully-live client, 1 churned.
- The live client also has an assigned contractor, a completed `onboarding_run`,
  3 `captured_leads`, 6 `events` (provisioning, payments, a health check, a
  call-forward failure, plus a global scraper event), and setup + residual
  `commissions`.

## Migrations
Plain numbered SQL files in `migrations/` (e.g. `0001_init.sql`). The runner wraps
each file in a transaction together with its bookkeeping row, so a migration is
either fully applied or not at all. To add a change, create the next numbered file
and run `npm run migrate`.

## Layout
```
ai-receptionist-db/
├── migrations/
│   └── 0001_init.sql       # enums, tables, FKs, indexes, updated_at trigger
├── scripts/
│   ├── db.js               # shared connection (reads DATABASE_URL / PGSSL)
│   ├── migrate.js          # transactional migration runner
│   ├── seed.js             # idempotent sample data
│   └── verify.js           # health check + representative queries
├── .env.example
├── package.json
└── README.md
```
