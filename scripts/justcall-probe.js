'use strict';
// Verify JustCall API connectivity + auth. Works even with zero calls (during the
// payment hold) — it confirms the key/secret and endpoint are right.
//   node --env-file=.env scripts/justcall-probe.js

const jc = require('../lib/justcall');

async function main() {
  console.log('JustCall base:', process.env.JUSTCALL_API_BASE || 'https://api.justcall.io');
  if (!process.env.JUSTCALL_API_KEY || !process.env.JUSTCALL_API_SECRET) {
    console.error('✗ JUSTCALL_API_KEY / JUSTCALL_API_SECRET not set in .env'); process.exit(1);
  }
  try {
    const res   = await jc.listCalls({ per_page: 3 });
    const calls = res?.data ?? res?.calls ?? (Array.isArray(res) ? res : []);
    console.log('✓ Auth OK — endpoint reachable.');
    console.log('  Top-level response keys:', Object.keys(res).slice(0, 12).join(', '));
    console.log('  Recent calls returned:', calls.length);
    if (calls.length) {
      console.log('  First call keys:', Object.keys(calls[0]).join(', '));
      console.log('  (Note these against lib/justcall.js / the extractor mapping.)');
    } else {
      console.log('  (No calls yet — expected during the payment hold. Auth + endpoint confirmed.)');
    }
  } catch (e) {
    console.error('✗ JustCall probe failed:', e.message);
    if (/401|403/.test(e.message)) {
      console.error('  → Likely the Authorization header format. Check the JustCall API reference and');
      console.error('    adjust authHeader() in lib/justcall.js (currently "<key>:<secret>").');
    }
    process.exit(1);
  }
}

main();
