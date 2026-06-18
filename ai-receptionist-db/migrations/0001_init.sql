-- 0001_init.sql
-- AI-receptionist agency platform — database spine.
-- Single source of truth for lead pipeline, onboarding, billing, monitoring, commissions.
--
-- Design notes:
--   * `clients` is a LIFECYCLE record (lead -> ... -> churned), one row per business.
--   * Voice vendor is NEVER hardcoded: stored as (voice_provider, voice_provider_account_id) text.
--   * jsonb is used for structured-but-flexible config (hours, alerts, guardrails).
--   * `events` is append-only and is the audit/monitoring substrate.
--   * Onboarding is resumable: `clients.provisioning_checkpoint` + `onboarding_runs` checkpoint state.
--
-- The migration runner wraps this file in a single transaction.

-- gen_random_uuid() is core since PG13; pgcrypto kept for older servers / belt-and-suspenders.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums (real Postgres enums)
-- ---------------------------------------------------------------------------

-- Lifecycle status the `clients` row travels through.
create type client_status as enum (
  'lead', 'contacted', 'pilot', 'won', 'provisioning', 'live', 'paused', 'churned'
);

-- Vertical of the business. Designed to expand: add values later with
--   ALTER TYPE business_type ADD VALUE 'hvac';
create type business_type as enum ('plumbing');

create type tier_level as enum ('A', 'B', 'C');

-- Voice/answering tone of the receptionist.
create type tone as enum ('professional', 'friendly', 'casual', 'formal');

-- What the bot does outside business hours.
create type after_hours_behavior as enum ('voicemail', 'forward', 'ai_message', 'emergency_only');

create type billing_status as enum ('none', 'pending', 'active', 'past_due', 'canceled');

create type contractor_status as enum ('active', 'inactive');

-- Append-only event types. 'other' is the explicit fallback bucket.
create type event_type as enum (
  'provisioning_step',
  'payment_succeeded',
  'payment_failed',
  'bot_health_check',
  'call_forward_failure',
  'report_sent',
  'other'
);

create type commission_type as enum ('setup', 'residual');
create type commission_status as enum ('accrued', 'paid');

create type onboarding_status as enum ('running', 'failed', 'completed');

-- ---------------------------------------------------------------------------
-- contractors — sales reps who source/close clients and earn commissions.
-- ---------------------------------------------------------------------------
create table contractors (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  email                   text,
  phone                   text,
  status                  contractor_status not null default 'active',
  commission_setup        numeric(10,2) not null default 0,   -- flat $ per closed setup
  commission_residual_pct numeric(5,2)  not null default 0,   -- % of MRR, e.g. 10.00 = 10%
  created_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients — THE SPINE. One row per business, from raw lead to churned client.
-- ---------------------------------------------------------------------------
create table clients (
  id                          uuid primary key default gen_random_uuid(),
  status                      client_status not null default 'lead',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- Sourcing
  business_name               text not null,
  business_type               business_type not null default 'plumbing',
  phone                       text,
  email                       text,
  website                     text,
  address                     text,
  city                        text,
  state                       text,
  zip                         text,
  place_id                    text,                            -- external map id for dedup
  rating                      numeric(2,1),                    -- e.g. 4.7
  review_count                integer,
  fit_score                   integer check (fit_score is null or (fit_score between 0 and 100)),
  tier                        tier_level,                      -- null until scored
  source                      text,

  -- Sales
  contractor_id               uuid references contractors(id) on delete set null,
  assigned_at                 timestamptz,
  last_contacted_at           timestamptz,

  -- Config (structured-but-flexible -> jsonb; simple list -> text[])
  services_offered            text[],
  service_area                jsonb,
  business_hours              jsonb,
  forward_to_number           text,
  alert_destination           jsonb,                           -- sms/email/slack alert prefs
  tone                        tone not null default 'professional',
  do_not_say                  jsonb not null default '[]'::jsonb,
  after_hours_behavior        after_hours_behavior not null default 'voicemail',
  escalation_keywords         jsonb not null default '[]'::jsonb,

  -- Provisioning (vendor-agnostic)
  voice_provider              text,                            -- e.g. 'vapi','retell','bland','twilio'
  voice_provider_account_id   text,                            -- that provider's account/agent id
  provisioned_number          text,
  content_pack_version        text,
  provisioning_checkpoint     jsonb,                           -- resumable provisioning state
  activated_at                timestamptz,

  -- Billing
  stripe_customer_id          text,
  stripe_subscription_id      text,
  setup_fee_paid              boolean not null default false,
  billing_status              billing_status not null default 'none',
  mrr                         numeric(10,2) not null default 0,
  churned_at                  timestamptz
);

-- ---------------------------------------------------------------------------
-- captured_leads — inbound calls the bot answered/captured for a client.
-- Belong to the client -> CASCADE on client delete.
-- ---------------------------------------------------------------------------
create table captured_leads (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  caller_number         text,
  caller_name           text,
  summary               text,
  is_emergency          boolean not null default false,
  call_duration_seconds integer,
  raw_payload           jsonb,                                 -- full vendor webhook payload
  captured_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events — APPEND-ONLY audit / monitoring substrate.
-- client_id nullable (some events are platform-global). SET NULL preserves trail.
-- ---------------------------------------------------------------------------
create table events (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references clients(id) on delete set null,
  type       event_type not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- commissions — financial history. NEVER auto-deleted -> RESTRICT.
-- ---------------------------------------------------------------------------
create table commissions (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete restrict,
  client_id     uuid not null references clients(id) on delete restrict,
  type          commission_type not null,
  amount        numeric(10,2) not null,
  period        text,                                          -- e.g. '2026-06'
  status        commission_status not null default 'accrued',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- onboarding_runs — resumable multi-step provisioning pipeline executions.
-- Operational, tied to client lifecycle -> CASCADE.
-- ---------------------------------------------------------------------------
create table onboarding_runs (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  status          onboarding_status not null default 'running',
  current_step    text,
  steps_completed jsonb not null default '[]'::jsonb,
  error           text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- updated_at auto-maintenance (trigger). Only `clients` carries updated_at.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_set_updated_at
  before update on clients
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (only on fields that will actually be queried)
-- ---------------------------------------------------------------------------
create index idx_clients_status         on clients (status);
create index idx_clients_contractor_id  on clients (contractor_id);
create index idx_clients_tier           on clients (tier);
create index idx_clients_billing_status on clients (billing_status);
-- Dedup: a place_id may appear at most once, but many rows have none.
create unique index uq_clients_place_id on clients (place_id) where place_id is not null;

create index idx_captured_leads_client_id on captured_leads (client_id);

create index idx_events_client_id        on events (client_id);
create index idx_events_type             on events (type);
-- Powers "recent failure events" scans.
create index idx_events_type_created_at  on events (type, created_at desc);

create index idx_commissions_contractor_id on commissions (contractor_id);
create index idx_commissions_status        on commissions (status);

create index idx_onboarding_runs_client_id on onboarding_runs (client_id);
