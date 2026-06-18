// seed.js — inserts realistic sample data spanning the client lifecycle.
// Idempotent: uses fixed UUIDs + ON CONFLICT DO NOTHING, so re-running is safe.
//
// Shape produced:
//   2 contractors
//   clients: 2 raw leads, 1 pilot, 1 fully-live client (billing + captured_leads + events),
//            1 churned client (so churn queries have data too)
//   the live client also has: an assigned contractor, a completed onboarding_run,
//            captured_leads, monitoring/payment events, and setup+residual commissions.
const { getPool } = require('./db');

// --- Fixed ids (stable across re-seeds) ------------------------------------
const C1 = '11111111-1111-1111-1111-111111111111'; // contractor: Dana Reyes
const C2 = '22222222-2222-2222-2222-222222222222'; // contractor: Marcus Lee

const L1 = 'aaaaaaa1-0000-0000-0000-000000000001'; // lead
const L2 = 'aaaaaaa1-0000-0000-0000-000000000002'; // lead
const PILOT = 'aaaaaaa1-0000-0000-0000-000000000003'; // pilot
const LIVE = 'aaaaaaa1-0000-0000-0000-000000000004'; // live (full)
const CHURN = 'aaaaaaa1-0000-0000-0000-000000000005'; // churned

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');

    // -- contractors --------------------------------------------------------
    await client.query(
      `insert into contractors (id, name, email, phone, status, commission_setup, commission_residual_pct)
       values
         ($1, 'Dana Reyes',  'dana@aria-agency.com',   '+15125550111', 'active', 250.00, 10.00),
         ($2, 'Marcus Lee',  'marcus@aria-agency.com', '+15125550122', 'active', 300.00, 12.50)
       on conflict (id) do nothing`,
      [C1, C2]
    );

    // -- raw leads (just sourced, not yet worked) ---------------------------
    await client.query(
      `insert into clients
         (id, status, business_name, business_type, phone, email, website, address, city, state, zip,
          place_id, rating, review_count, fit_score, tier, source)
       values
         ($1, 'lead', 'Rapid Rooter Plumbing', 'plumbing', '+15125550201', NULL,
          'https://rapidrooter.example', '100 Main St', 'Austin', 'TX', '78701',
          'gmaps:rapid-rooter-001', 4.6, 182, 78, 'B', 'google_maps_scrape'),
         ($2, 'lead', 'Hill Country Drain Co', 'plumbing', '+15125550202', 'info@hcdrain.example',
          NULL, '88 Bee Cave Rd', 'Austin', 'TX', '78746',
          'gmaps:hc-drain-002', 4.9, 421, 91, 'A', 'google_maps_scrape')
       on conflict (id) do nothing`,
      [L1, L2]
    );

    // -- pilot (in a trial, contractor assigned) ----------------------------
    await client.query(
      `insert into clients
         (id, status, business_name, business_type, phone, email, address, city, state, zip,
          place_id, rating, review_count, fit_score, tier, source,
          contractor_id, assigned_at, last_contacted_at,
          services_offered, service_area, business_hours, tone, after_hours_behavior,
          escalation_keywords, do_not_say)
       values
         ($1, 'pilot', 'Lone Star Leak Detection', 'plumbing', '+15125550203', 'ops@lonestarleak.example',
          '4501 Guadalupe St', 'Austin', 'TX', '78751',
          'gmaps:lonestar-003', 4.7, 256, 85, 'A', 'referral',
          $2, now() - interval '9 days', now() - interval '2 days',
          ARRAY['leak detection','repiping','water heaters'],
          '{"radius_miles": 25, "zips": ["78751","78701","78746"]}'::jsonb,
          '{"mon-fri": "08:00-18:00", "sat": "09:00-13:00", "sun": "closed"}'::jsonb,
          'professional', 'voicemail',
          '["burst pipe","flooding","no water","gas smell"]'::jsonb,
          '["we guarantee","cheapest in town"]'::jsonb)
       on conflict (id) do nothing`,
      [PILOT, C1]
    );

    // -- fully live client (provisioned + billing active) -------------------
    await client.query(
      `insert into clients
         (id, status, business_name, business_type, phone, email, website, address, city, state, zip,
          place_id, rating, review_count, fit_score, tier, source,
          contractor_id, assigned_at, last_contacted_at,
          services_offered, service_area, business_hours, forward_to_number, alert_destination,
          tone, do_not_say, after_hours_behavior, escalation_keywords,
          voice_provider, voice_provider_account_id, provisioned_number, content_pack_version,
          provisioning_checkpoint, activated_at,
          stripe_customer_id, stripe_subscription_id, setup_fee_paid, billing_status, mrr)
       values
         ($1, 'live', 'Capital City Plumbing', 'plumbing', '+15125550204', 'front@capcityplumb.example',
          'https://capcityplumb.example', '1200 Congress Ave', 'Austin', 'TX', '78701',
          'gmaps:capcity-004', 4.8, 612, 94, 'A', 'cold_call',
          $2, now() - interval '40 days', now() - interval '20 days',
          ARRAY['emergency repair','drain cleaning','water heaters','remodels'],
          '{"radius_miles": 30, "zips": ["78701","78702","78703","78704"]}'::jsonb,
          '{"mon-fri": "07:00-19:00", "sat": "08:00-16:00", "sun": "emergency_only"}'::jsonb,
          '+15125550999',
          '{"sms": ["+15125550999"], "email": ["owner@capcityplumb.example"], "slack_webhook": null}'::jsonb,
          'friendly', '["we are licensed in all states"]'::jsonb, 'emergency_only',
          '["burst","flood","sewage","gas leak","no hot water"]'::jsonb,
          'vapi', 'acct_vapi_7Hk29', '+15129990004', 'plumbing-v3',
          '{"step": "completed", "last_ok_at": "2026-05-07T15:00:00Z"}'::jsonb,
          now() - interval '38 days',
          'cus_PqX1capcity', 'sub_1Ncapcity', true, 'active', 499.00)
       on conflict (id) do nothing`,
      [LIVE, C2]
    );

    // -- churned client (was live, now cancelled) ---------------------------
    await client.query(
      `insert into clients
         (id, status, business_name, business_type, phone, email, address, city, state, zip,
          place_id, fit_score, tier, source, contractor_id,
          voice_provider, voice_provider_account_id, provisioned_number,
          stripe_customer_id, stripe_subscription_id, setup_fee_paid, billing_status, mrr,
          activated_at, churned_at)
       values
         ($1, 'churned', 'Sunset Pipe Works', 'plumbing', '+15125550205', 'admin@sunsetpipe.example',
          '777 Riverside Dr', 'Austin', 'TX', '78704',
          'gmaps:sunset-005', 70, 'C', 'cold_call', $2,
          'vapi', 'acct_vapi_old11', '+15129990005',
          'cus_sunset', 'sub_sunset', true, 'canceled', 0,
          now() - interval '120 days', now() - interval '15 days')
       on conflict (id) do nothing`,
      [CHURN, C1]
    );

    // -- captured_leads for the live client ---------------------------------
    await client.query(
      `insert into captured_leads
         (id, client_id, caller_number, caller_name, summary, is_emergency, call_duration_seconds, raw_payload, captured_at)
       values
         ('cccccccc-0000-0000-0000-000000000001', $1, '+15125551777', 'Janet M.',
          'Kitchen sink backing up, wants next-day appointment.', false, 142,
          '{"provider":"vapi","call_id":"call_a1","intent":"booking"}'::jsonb, now() - interval '3 days'),
         ('cccccccc-0000-0000-0000-000000000002', $1, '+15125551888', 'Rob T.',
          'Burst pipe in garage, water everywhere — EMERGENCY.', true, 96,
          '{"provider":"vapi","call_id":"call_a2","intent":"emergency"}'::jsonb, now() - interval '1 day'),
         ('cccccccc-0000-0000-0000-000000000003', $1, '+15125551999', NULL,
          'Asked about water heater replacement pricing.', false, 210,
          '{"provider":"vapi","call_id":"call_a3","intent":"quote"}'::jsonb, now() - interval '6 hours')
       on conflict (id) do nothing`,
      [LIVE]
    );

    // -- events: append-only audit/monitoring trail -------------------------
    await client.query(
      `insert into events (id, client_id, type, payload, created_at)
       values
         ('eeeeeeee-0000-0000-0000-000000000001', $1, 'provisioning_step',
          '{"step":"number_purchased","number":"+15129990004"}'::jsonb, now() - interval '38 days'),
         ('eeeeeeee-0000-0000-0000-000000000002', $1, 'payment_succeeded',
          '{"invoice":"in_001","amount":499.00,"currency":"usd"}'::jsonb, now() - interval '30 days'),
         ('eeeeeeee-0000-0000-0000-000000000003', $1, 'bot_health_check',
          '{"ok":true,"latency_ms":210}'::jsonb, now() - interval '2 hours'),
         ('eeeeeeee-0000-0000-0000-000000000004', $1, 'call_forward_failure',
          '{"ok":false,"reason":"carrier_timeout","number":"+15125550999"}'::jsonb, now() - interval '5 hours'),
         ('eeeeeeee-0000-0000-0000-000000000005', $2, 'payment_failed',
          '{"invoice":"in_009","amount":499.00,"reason":"card_declined"}'::jsonb, now() - interval '16 days'),
         ('eeeeeeee-0000-0000-0000-000000000006', NULL, 'other',
          '{"note":"nightly scraper run completed","new_leads":2}'::jsonb, now() - interval '1 day')
       on conflict (id) do nothing`,
      [LIVE, CHURN]
    );

    // -- onboarding run for the live client (completed) ---------------------
    await client.query(
      `insert into onboarding_runs
         (id, client_id, status, current_step, steps_completed, error, started_at, completed_at)
       values
         ('dddddddd-0000-0000-0000-000000000001', $1, 'completed', 'done',
          '["buy_number","build_agent","load_content_pack","configure_forwarding","smoke_test"]'::jsonb,
          NULL, now() - interval '39 days', now() - interval '38 days')
       on conflict (id) do nothing`,
      [LIVE]
    );

    // -- commissions for the live client's closer (Marcus / C2) -------------
    await client.query(
      `insert into commissions (id, contractor_id, client_id, type, amount, period, status, created_at)
       values
         ('ffffffff-0000-0000-0000-000000000001', $1, $2, 'setup',    300.00, '2026-05', 'paid',    now() - interval '38 days'),
         ('ffffffff-0000-0000-0000-000000000002', $1, $2, 'residual',  62.38, '2026-06', 'accrued', now() - interval '5 days')
       on conflict (id) do nothing`,
      [C2, LIVE]
    );

    await client.query('commit');
    console.log('Seed complete: 2 contractors, 5 clients (2 leads, 1 pilot, 1 live, 1 churned), 3 captured_leads, 6 events, 1 onboarding_run, 2 commissions.');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
