'use strict';

/**
 * trillet-probe.js — Phase 1 safe discovery of the Trillet API.
 *
 * ALL requests here are GET (read-only).  Nothing creates, provisions, or costs money.
 *
 * What this script does:
 *   1. Verifies the API key is accepted (auth check at multiple candidate roots)
 *   2. Probes every plausible REST path to discover which endpoints exist
 *   3. Prints a capability table so Phase 2 can map checklist items → real endpoints
 *
 * What this script does NOT do:
 *   - POST  /sub-accounts   (create sub-account — costs)
 *   - POST  /numbers        (buy a phone number — costs)
 *   - POST  /agents         (create agent)
 *   - POST  /test-call      (triggers a real call)
 *   Anything destructive will be described + flagged for explicit go-ahead first.
 */

require('dotenv').config();

const API_KEY = process.env.TRILLET_API_KEY;
if (!API_KEY) {
  console.error('ERROR: TRILLET_API_KEY not set. Did you forget to source .env?');
  process.exit(1);
}

// We'll probe both candidate base patterns — the curl example showed /v1/api/.
const BASES = [
  'https://api.trillet.ai/v1/api',
  'https://api.trillet.ai/v1',
  'https://api.trillet.ai',
];

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Makes one GET request and returns structured result (never throws).
 * @param {string} url
 * @returns {Promise<{url, status, ok, latencyMs, body: string, json: any}>}
 */
async function get(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* non-JSON body */ }
    return { url, status: res.status, ok: res.ok, latencyMs: Date.now() - t0, body, json };
  } catch (err) {
    return { url, status: 0, ok: false, latencyMs: Date.now() - t0, body: '', json: null, err: err.message };
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function statusTag(r) {
  if (r.err) return '🔌 NETWORK ERR';
  if (r.status === 200) return '✅ 200 OK';
  if (r.status === 201) return '✅ 201';
  if (r.status === 204) return '✅ 204';
  if (r.status === 401) return '🔑 401 UNAUTH';
  if (r.status === 403) return '🚫 403 FORBIDDEN';
  if (r.status === 404) return '🚫 404 NOT FOUND';
  if (r.status === 405) return '⚠️  405 METHOD NOT ALLOWED';
  if (r.status === 422) return '⚠️  422 UNPROCESSABLE';
  if (r.status === 429) return '⏳ 429 RATE LIMITED';
  if (r.status === 500) return '💥 500 SERVER ERROR';
  return `❓ ${r.status}`;
}

function truncate(str, n = 300) {
  if (!str) return '(empty)';
  const s = str.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function hr(char = '─', len = 72) { return char.repeat(len); }

function printResult(label, r) {
  const tag = statusTag(r);
  const ms  = `${r.latencyMs}ms`;
  console.log(`  ${tag.padEnd(22)} ${ms.padStart(6)}  ${label}`);
  if (r.err) {
    console.log(`    Error: ${r.err}`);
  } else if (r.ok || r.status === 404) {
    // Show body only for success or 404 (useful to see "not found" shapes)
    const snippet = r.json ? JSON.stringify(r.json).slice(0, 200) : truncate(r.body, 200);
    if (snippet && snippet !== '(empty)') console.log(`    Body: ${snippet}`);
  } else if (r.status === 401 || r.status === 403) {
    // Auth errors — show error body to understand auth format expected
    console.log(`    Auth error: ${truncate(r.body, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Probe definitions — ALL are GET, read-only
// ---------------------------------------------------------------------------

const ENDPOINT_PATHS = [
  // Root discovery
  { label: 'API root',             path: '/' },
  { label: 'API root (no slash)',  path: '' },

  // Agency / account level
  { label: 'Agency info',          path: '/agency' },
  { label: 'Agency profile',       path: '/agency/profile' },
  { label: 'Agency me/self',       path: '/me' },
  { label: 'Account',              path: '/account' },
  { label: 'Organization',         path: '/organization' },

  // Sub-accounts
  { label: 'Sub-accounts list',    path: '/sub-accounts' },
  { label: 'Accounts list',        path: '/accounts' },
  { label: 'Clients list',         path: '/clients' },

  // Agents / assistants
  { label: 'Agents list',          path: '/agents' },
  { label: 'Assistants list',      path: '/assistants' },
  { label: 'Bots list',            path: '/bots' },
  { label: 'Receptionist list',    path: '/receptionists' },

  // Phone numbers
  { label: 'Phone numbers list',   path: '/phone-numbers' },
  { label: 'Numbers list',         path: '/numbers' },
  { label: 'DIDs list',            path: '/dids' },
  { label: 'Available numbers',    path: '/available-numbers' },

  // Calls / logs
  { label: 'Calls list',           path: '/calls' },
  { label: 'Call logs',            path: '/call-logs' },
  { label: 'Transcripts',          path: '/transcripts' },
  { label: 'Recordings',           path: '/recordings' },

  // Webhooks / events
  { label: 'Webhooks list',        path: '/webhooks' },
  { label: 'Events list',          path: '/events' },

  // Billing / usage
  { label: 'Usage',                path: '/usage' },
  { label: 'Billing',              path: '/billing' },
  { label: 'Subscription',         path: '/subscription' },

  // Misc
  { label: 'Health / ping',        path: '/health' },
  { label: 'Status',               path: '/status' },
  { label: 'Docs / openapi',       path: '/docs' },
  { label: 'OpenAPI spec',         path: '/openapi.json' },
  { label: 'Swagger',              path: '/swagger.json' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + hr('═'));
  console.log(' TRILLET API — Phase 1 Read-Only Probe');
  console.log(' All requests: GET only. Nothing created. Nothing provisioned.');
  console.log(hr('═'));
  console.log(`\n Key: ${API_KEY.slice(0,4)}${'*'.repeat(API_KEY.length - 8)}${API_KEY.slice(-4)}`);
  console.log(` Date: ${new Date().toISOString()}`);

  // ── Step 1: Find which base URL responds ──────────────────────────────────
  console.log('\n' + hr());
  console.log(' STEP 1 — Base URL detection');
  console.log(hr());

  let workingBase = null;
  for (const base of BASES) {
    const r = await get(base + '/');
    console.log();
    printResult(base + '/', r);
    // Auth error means the URL is right but key is being checked
    if (r.ok || r.status === 401 || r.status === 403 || r.status === 404 || r.status === 405) {
      if (!workingBase) {
        workingBase = base;
        if (r.status === 200 || r.status === 401 || r.status === 403) {
          console.log(`  → Will use this as base for endpoint discovery.`);
          break; // Found a definitive base
        }
      }
    }
  }

  if (!workingBase) {
    workingBase = BASES[0]; // Fallback to /v1/api if nothing definitive
    console.log(`\n  No base returned 200/401. Defaulting to: ${workingBase}`);
  }

  // ── Step 2: Auth verification ─────────────────────────────────────────────
  console.log('\n' + hr());
  console.log(' STEP 2 — Auth check (is the API key format correct?)');
  console.log(hr());

  // Try without auth to see what the "unauthorized" shape looks like
  const unauthed = await fetch(workingBase + '/me', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
  }).then(async r => ({ status: r.status, body: await r.text() })).catch(e => ({ status: 0, body: e.message }));
  console.log(`\n  Without auth → HTTP ${unauthed.status}: ${truncate(unauthed.body, 150)}`);

  const authed = await get(workingBase + '/me');
  console.log(`  With x-api-key  → `);
  printResult('/me', authed);

  // Also try Bearer token format in case they support both
  const bearerRes = await fetch(workingBase + '/me', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
  }).then(async r => ({ status: r.status, body: await r.text() })).catch(e => ({ status: 0, body: e.message }));
  console.log(`  With Bearer hdr → HTTP ${bearerRes.status}: ${truncate(bearerRes.body, 150)}`);

  // ── Step 3: Full endpoint discovery ───────────────────────────────────────
  console.log('\n' + hr());
  console.log(` STEP 3 — Endpoint discovery (GET only, base: ${workingBase})`);
  console.log(hr());
  console.log();

  const results = [];
  for (const { label, path } of ENDPOINT_PATHS) {
    const url = workingBase + path;
    const r   = await get(url);
    results.push({ label, path, r });
    printResult(`${label.padEnd(24)} ${path || '(root)'}`, r);
    // Small jitter to avoid rate-limiting
    await new Promise(ok => setTimeout(ok, 120));
  }

  // ── Step 4: Capability summary ────────────────────────────────────────────
  console.log('\n' + hr('═'));
  console.log(' PHASE 2 DRAFT — Capability table (update after full doc review)');
  console.log(hr('═'));
  console.log();

  const exists  = results.filter(({ r }) => r.ok || r.status === 405);   // 405 = route exists, method not allowed
  const auth401 = results.filter(({ r }) => r.status === 401);
  const auth403 = results.filter(({ r }) => r.status === 403);
  const missing = results.filter(({ r }) => r.status === 404);
  const errors  = results.filter(({ r }) => r.status === 500 || r.err);

  if (exists.length) {
    console.log(' ✅  Endpoints that returned 200/405 (route confirmed):');
    for (const { label, path } of exists) console.log(`    ${label.padEnd(26)} ${path}`);
    console.log();
  }
  if (auth401.length || auth403.length) {
    console.log(' 🔑  Endpoints that rejected with 401/403 (route exists, auth enforced):');
    for (const { label, path } of [...auth401, ...auth403]) console.log(`    ${label.padEnd(26)} ${path}`);
    console.log();
  }
  if (missing.length) {
    console.log(' 🚫  Endpoints that returned 404 (path not found):');
    for (const { label, path } of missing) console.log(`    ${label.padEnd(26)} ${path}`);
    console.log();
  }
  if (errors.length) {
    console.log(' 💥  Network errors or 500s:');
    for (const { label, path, r } of errors) console.log(`    ${label.padEnd(26)} ${path}  → ${r.err || r.status}`);
    console.log();
  }

  console.log(hr('─'));
  console.log(' CHECKLIST STATUS (preliminary — requires full doc read):');
  console.log(hr('─'));
  console.log();
  console.log(' #1  Sub-account creation    → see /sub-accounts or /accounts results above');
  console.log(' #2  Phone number provision  → see /phone-numbers or /numbers results above');
  console.log(' #3  Agent create/config     → see /agents or /assistants results above');
  console.log(' #4  Content pack push       → (agent update endpoint — see #3)');
  console.log(' #5  Live config update      → (agent PATCH — needs endpoint from #3)');
  console.log(' #6  Test call trigger       → NOT probed (POST — costs money, needs go-ahead)');
  console.log(' #7  Deprovisioning          → NOT probed (DELETE — irreversible, needs go-ahead)');
  console.log(' #8  Sandbox / test mode     → look for any sandbox/test URL or flag in responses');
  console.log(' #9  Rate limits + latency   → check response headers from any 200 above');
  console.log();
  console.log(' ⚠️  Items #6 and #7 require your explicit go-ahead before any request is sent.');
  console.log();

  // ── Step 5: Response headers from any 200 ────────────────────────────────
  // Re-hit one confirmed route to capture headers
  const anyOk = exists[0];
  if (anyOk) {
    console.log(hr('─'));
    console.log(` Response headers from first 200 (${anyOk.path || 'root'}):`);
    console.log(hr('─'));
    const h = await fetch(workingBase + anyOk.path, {
      method: 'GET',
      headers: { 'x-api-key': API_KEY, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (h) {
      for (const [k, v] of h.headers.entries()) {
        console.log(`  ${k.padEnd(30)} ${v}`);
      }
    }
  }

  console.log('\n' + hr('═'));
  console.log(' Phase 1 probe complete. No resources created.');
  console.log(hr('═') + '\n');
}

main().catch(err => {
  console.error('\nPROBE FAILED:', err);
  process.exit(1);
});
