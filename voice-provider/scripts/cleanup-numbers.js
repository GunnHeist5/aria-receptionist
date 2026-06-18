'use strict';
// cleanup-numbers.js — list all purchased numbers and release them.
// Usage: node voice-provider/scripts/cleanup-numbers.js
//        node voice-provider/scripts/cleanup-numbers.js --dry-run   (list only, no release)

const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../../workers/.env') });
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;
const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const DRY  = process.argv.includes('--dry-run');

if (!KEY || !WID) { console.error('Missing TRILLET_API_KEY or TRILLET_WORKSPACE_ID'); process.exit(1); }

async function req(method, path, body) {
  const res  = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined,
    signal:  AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${JSON.stringify(json)}`);
  return json;
}

(async () => {
  console.log('Fetching purchased numbers…\n');
  const data = await req('GET', '/twilio/phone-numbers');
  const nums = data.phoneNumbers || data.numbers || data.data || (Array.isArray(data) ? data : []);

  if (!nums.length) {
    console.log('No purchased numbers found (or unexpected response shape).');
    console.log('Raw response:', JSON.stringify(data, null, 2));
    return;
  }

  console.log(`Found ${nums.length} number(s):`);
  for (const n of nums) {
    console.log(`  ${n.phoneNumber ?? n.number}  sid=${n.sid ?? n._id ?? n.id}  agentId=${n.agentId ?? 'none'}`);
  }

  if (DRY) { console.log('\n--dry-run: no releases performed.'); return; }

  console.log('\nReleasing all…');
  for (const n of nums) {
    const sid = n.sid ?? n._id ?? n.id;
    if (!sid) { console.log(`  SKIP  ${n.phoneNumber} — no sid found`); continue; }
    try {
      const r = await req('POST', '/twilio/release-number', { phoneNumberId: String(sid) });
      console.log(`  ✓ released  ${n.phoneNumber ?? n.number}  sid=${sid}`, JSON.stringify(r));
    } catch (err) {
      console.log(`  ✗ failed    ${n.phoneNumber ?? n.number}  sid=${sid}: ${err.message}`);
    }
  }
})().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
