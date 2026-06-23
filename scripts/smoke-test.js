'use strict';
// ---------------------------------------------------------------------------
// Top-to-bottom smoke test for the Reachwell platform.
// Read-only / non-destructive: does NOT create contractors, send Telegram
// messages, or hit any Stripe/PandaDoc write endpoint.
//
//   Usage: node --env-file=.env scripts/smoke-test.js
//
// Checks: env vars, DB connectivity, schema (tables/columns/enums the code
// actually uses), external API auth (Stripe, PandaDoc, Telegram, OpenAI,
// Anthropic, Trillet), live HTTP endpoints, webhook auth gates, PM2 health,
// and a data snapshot. Exits non-zero if any hard check fails.
// ---------------------------------------------------------------------------

const { Pool } = require('pg');
const { execSync } = require('child_process');

const results = [];
function rec(section, name, status, detail) {
  results.push({ section, status });
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️ ' : '❌';
  console.log(`${icon} [${section}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function httpFetch(url, opts = {}, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------
async function checkEnv() {
  console.log('\n── 1. ENVIRONMENT ──');
  const required = [
    'DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_OWNER_CHAT_ID', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_BOT_USERNAME',
    'PANDADOC_API_KEY', 'PANDADOC_TEMPLATE_ID', 'PANDADOC_RECIPIENT_ROLE',
    'NEXT_PUBLIC_BASE_URL', 'INTAKE_TOKEN',
  ];
  const optional = ['TRILLET_API_KEY', 'TRILLET_API_BASE_URL', 'TRILLET_WORKSPACE_ID',
    'GOOGLE_PLACES_API_KEY', 'VOICE_PROVIDER', 'SETUP_FEE_CENTS', 'MONTHLY_PRICE_CENTS', 'COMMISSION_CLAWBACK_DAYS'];

  for (const k of required) {
    const raw = process.env[k];
    if (!raw) { rec('env', k, 'fail', 'missing'); continue; }
    if (raw !== raw.trim()) { rec('env', k, 'warn', 'has leading/trailing whitespace — fix in .env'); continue; }
    rec('env', k, 'pass', `set (${raw.length} chars)`);
  }
  for (const k of optional) {
    const raw = process.env[k];
    if (!raw) rec('env', k, 'warn', 'not set (optional)');
    else if (raw !== raw.trim()) rec('env', k, 'warn', 'has whitespace');
    else rec('env', k, 'pass', k === 'VOICE_PROVIDER' ? raw : 'set');
  }
  // Specific format gotchas we've hit before
  if (process.env.TELEGRAM_BOT_USERNAME?.startsWith('@'))
    rec('env', 'TELEGRAM_BOT_USERNAME format', 'fail', 'starts with @ — deep links will be invalid');
}

// ---------------------------------------------------------------------------
async function checkDbAndSchema(pool) {
  console.log('\n── 2. DATABASE + SCHEMA ──');
  try {
    const { rows: [v] } = await pool.query('SELECT version()');
    rec('db', 'connection', 'pass', v.version.split(',')[0]);
  } catch (e) {
    rec('db', 'connection', 'fail', e.message);
    return; // nothing else works without DB
  }

  // Pull every public column once
  const { rows: cols } = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const have = new Set(cols.map(c => `${c.table_name}.${c.column_name}`));
  const tables = new Set(cols.map(c => c.table_name));

  // (table, [columns the code depends on])
  const expect = {
    contractors:           ['slug', 'active', 'channel_id', 'commission_setup', 'commission_residual_pct', 'contract_signed_at', 'onboarding_step', 'last_active_at', 'updated_at'],
    candidates:            ['status', 'source', 'submission_url', 'transcript', 'score', 'hire_recommendation'],
    commissions:           ['contractor_id', 'client_id', 'type', 'amount', 'period', 'status', 'paid_at'],
    clients:               ['contractor_id', 'business_type', 'stripe_customer_id', 'stripe_subscription_id', 'mrr', 'billing_status', 'setup_fee_paid', 'forwarding_confirmed', 'carrier', 'voice_provider_account_id', 'churned_at'],
    rep_activity:          ['dials', 'connects', 'demos', 'closes'],
    rep_metrics:           ['total_closes', 'close_rate', 'health_status'],
    coaching_sessions:     ['trigger', 'contractor_reply', 'action_taken'],
    call_outcomes:         ['outcome', 'primary_objection', 'demo_method'],
    events:                ['type', 'payload'],
    knowledge_base:        ['category', 'content', 'is_placeholder'],
    offboarding_proposals: ['status', 'proposed_message'],
    objections:            ['description'],
  };

  for (const [tbl, columns] of Object.entries(expect)) {
    if (!tables.has(tbl)) { rec('schema', `table ${tbl}`, 'fail', 'missing'); continue; }
    const missing = columns.filter(c => !have.has(`${tbl}.${c}`));
    if (missing.length) rec('schema', `${tbl}`, 'fail', `missing columns: ${missing.join(', ')}`);
    else rec('schema', `${tbl}`, 'pass', `${columns.length} key columns present`);
  }

  // business_type enum must include all three trades
  try {
    const { rows: en } = await pool.query(
      `SELECT e.enumlabel AS v FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'business_type'`
    );
    const vals = en.map(r => r.v);
    const need = ['plumbing', 'hvac', 'combined'];
    const miss = need.filter(n => !vals.includes(n));
    if (miss.length) rec('schema', 'business_type enum', 'fail', `missing: ${miss.join(', ')} (run migrate-business-types.js)`);
    else rec('schema', 'business_type enum', 'pass', vals.join(', '));
  } catch (e) {
    rec('schema', 'business_type enum', 'warn', e.message);
  }
}

// ---------------------------------------------------------------------------
async function checkExternal() {
  console.log('\n── 3. EXTERNAL APIS ──');

  // Stripe — key valid + required events subscribed
  try {
    const Stripe = require('stripe');
    const s = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const eps = await s.webhookEndpoints.list({ limit: 10 });
    rec('stripe', 'auth', 'pass', `${eps.data.length} webhook endpoint(s)`);
    const ep = eps.data.find(e => /\/api\/webhooks\/stripe/.test(e.url));
    if (!ep) {
      rec('stripe', 'webhook endpoint', 'fail', 'no endpoint pointing at /api/webhooks/stripe');
    } else {
      const need = ['checkout.session.completed', 'invoice.payment_succeeded', 'invoice.payment_failed', 'customer.subscription.deleted'];
      const miss = need.filter(n => !ep.enabled_events.includes(n) && !ep.enabled_events.includes('*'));
      if (miss.length) rec('stripe', 'subscribed events', 'fail', `missing: ${miss.join(', ')}`);
      else rec('stripe', 'subscribed events', 'pass', 'all required events subscribed');
    }
  } catch (e) {
    rec('stripe', 'auth', 'fail', e.message);
  }

  // PandaDoc — key valid + configured role exists on template
  try {
    const key = (process.env.PANDADOC_API_KEY || '').trim();
    const tid = (process.env.PANDADOC_TEMPLATE_ID || '').trim();
    const role = (process.env.PANDADOC_RECIPIENT_ROLE || 'Client').trim();
    const r = await httpFetch(`https://api.pandadoc.com/public/v1/templates/${tid}/details`,
      { headers: { Authorization: `API-Key ${key}` } });
    if (!r.ok) { rec('pandadoc', 'template fetch', 'fail', `HTTP ${r.status}`); }
    else {
      const d = await r.json();
      const roles = (d.roles || []).map(x => x.name);
      if (roles.includes(role)) rec('pandadoc', 'role match', 'pass', `"${role}" exists on template`);
      else rec('pandadoc', 'role match', 'fail', `PANDADOC_RECIPIENT_ROLE="${role}" not in template roles [${roles.join(', ')}]`);
    }
  } catch (e) {
    rec('pandadoc', 'template fetch', 'fail', e.message);
  }

  // Telegram — bot token valid + webhook configured
  try {
    const tok = process.env.TELEGRAM_BOT_TOKEN.trim();
    const me = await (await httpFetch(`https://api.telegram.org/bot${tok}/getMe`)).json();
    if (me.ok) rec('telegram', 'getMe', 'pass', `@${me.result.username}`);
    else rec('telegram', 'getMe', 'fail', JSON.stringify(me));
    const wh = await (await httpFetch(`https://api.telegram.org/bot${tok}/getWebhookInfo`)).json();
    if (wh.ok) {
      const u = wh.result.url || '(none)';
      const expected = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/telegram`;
      const ok = u.startsWith(expected);
      rec('telegram', 'webhook url', ok ? 'pass' : 'warn', u + (wh.result.last_error_message ? ` | last_error: ${wh.result.last_error_message}` : ''));
      if (wh.result.pending_update_count > 0)
        rec('telegram', 'pending updates', 'warn', `${wh.result.pending_update_count} queued`);
    }
  } catch (e) {
    rec('telegram', 'getMe', 'fail', e.message);
  }

  // OpenAI — models list (free)
  try {
    const r = await httpFetch('https://api.openai.com/v1/models',
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}` } });
    rec('openai', 'auth', r.ok ? 'pass' : 'fail', `HTTP ${r.status}`);
  } catch (e) {
    rec('openai', 'auth', 'fail', e.message);
  }

  // Anthropic — models list (free)
  try {
    const r = await httpFetch('https://api.anthropic.com/v1/models',
      { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01' } });
    rec('anthropic', 'auth', r.ok ? 'pass' : 'fail', `HTTP ${r.status}`);
  } catch (e) {
    rec('anthropic', 'auth', 'fail', e.message);
  }

  // Trillet — informational (only matters when VOICE_PROVIDER != mock)
  const vp = process.env.VOICE_PROVIDER || 'mock';
  if (vp === 'mock') {
    rec('trillet', 'voice provider', 'warn', 'VOICE_PROVIDER=mock — Trillet not in active use');
  } else if (process.env.TRILLET_API_KEY && process.env.TRILLET_API_BASE_URL) {
    try {
      const r = await httpFetch(`${process.env.TRILLET_API_BASE_URL.trim()}/agents`,
        { headers: { Authorization: `Bearer ${process.env.TRILLET_API_KEY.trim()}` } });
      rec('trillet', 'reachable', r.ok ? 'pass' : 'warn', `HTTP ${r.status}`);
    } catch (e) {
      rec('trillet', 'reachable', 'warn', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
async function checkHttp() {
  console.log('\n── 4. LIVE HTTP ENDPOINTS ──');
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!base) { rec('http', 'base url', 'fail', 'NEXT_PUBLIC_BASE_URL not set'); return; }

  for (const path of ['/', '/apply']) {
    try {
      const r = await httpFetch(base + path);
      rec('http', `GET ${path}`, r.ok ? 'pass' : 'fail', `HTTP ${r.status}`);
    } catch (e) { rec('http', `GET ${path}`, 'fail', e.message); }
  }

  // Intake should be reachable with the token
  try {
    const r = await httpFetch(`${base}/intake?token=${process.env.INTAKE_TOKEN?.trim() ?? ''}`);
    rec('http', 'GET /intake?token', r.ok ? 'pass' : 'warn', `HTTP ${r.status}`);
  } catch (e) { rec('http', 'GET /intake?token', 'warn', e.message); }

  // Webhook auth gates must reject unauthenticated POSTs (no side effects)
  try {
    const r = await httpFetch(`${base}/api/webhooks/telegram`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    rec('http', 'telegram webhook auth gate', r.status === 401 ? 'pass' : 'warn',
      `expected 401, got ${r.status}`);
  } catch (e) { rec('http', 'telegram webhook auth gate', 'warn', e.message); }
}

// ---------------------------------------------------------------------------
function checkPm2() {
  console.log('\n── 5. PM2 PROCESSES ──');
  try {
    const list = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }));
    const byName = Object.fromEntries(list.map(p => [p.name, p.pm2_env?.status]));
    for (const name of ['aria-web', 'aria-worker', 'aria-sales']) {
      const st = byName[name];
      rec('pm2', name, st === 'online' ? 'pass' : 'fail', st || 'not found');
    }
    if ('aria-scraper' in byName)
      rec('pm2', 'aria-scraper', 'warn', `${byName['aria-scraper']} (expected stopped)`);
  } catch (e) {
    rec('pm2', 'pm2 jlist', 'warn', 'could not read pm2 — ' + e.message);
  }
}

// ---------------------------------------------------------------------------
async function dataSnapshot(pool) {
  console.log('\n── 6. DATA SNAPSHOT ──');
  try {
    const q = async (sql) => (await pool.query(sql)).rows;
    const cand = await q(`SELECT status, COUNT(*) n FROM candidates GROUP BY status ORDER BY n DESC`);
    const ctr  = await q(`SELECT COUNT(*) n, COUNT(*) FILTER (WHERE active) active FROM contractors`);
    const cli  = await q(`SELECT status, COUNT(*) n FROM clients GROUP BY status ORDER BY n DESC`);
    const comm = await q(`SELECT type, status, COUNT(*) n, COALESCE(SUM(amount),0) total FROM commissions GROUP BY type, status ORDER BY type`);
    console.log(`   Candidates: ${cand.map(r => `${r.status}=${r.n}`).join(', ') || 'none'}`);
    console.log(`   Contractors: ${ctr[0].n} total, ${ctr[0].active} active`);
    console.log(`   Clients: ${cli.map(r => `${r.status}=${r.n}`).join(', ') || 'none'}`);
    console.log(`   Commissions: ${comm.map(r => `${r.type}/${r.status}=${r.n} ($${Number(r.total).toFixed(2)})`).join(', ') || 'none'}`);
    rec('data', 'snapshot', 'pass', 'queried clean');
  } catch (e) {
    rec('data', 'snapshot', 'fail', e.message);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('========================================');
  console.log('  Reachwell platform smoke test');
  console.log('  ' + new Date().toISOString());
  console.log('========================================');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await checkEnv();
  await checkDbAndSchema(pool);
  await checkExternal();
  await checkHttp();
  checkPm2();
  await dataSnapshot(pool);
  await pool.end();

  const pass = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;

  console.log('\n========================================');
  console.log(`  RESULT: ${pass} passed, ${warn} warnings, ${fail} failed`);
  console.log('========================================');
  if (fail > 0) {
    console.log('\n❌ Failures:');
    for (const r of results.filter(x => x.status === 'fail')) console.log(`   - [${r.section}]`);
    process.exit(1);
  } else {
    console.log('\n✅ All hard checks passed' + (warn ? ` (${warn} warnings to review)` : '') + '.');
    process.exit(0);
  }
}

main().catch(e => { console.error('Smoke test crashed:', e); process.exit(1); });
