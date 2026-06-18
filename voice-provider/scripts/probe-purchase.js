'use strict';

/**
 * probe-purchase.js — buy one number, dump the raw response, release immediately.
 * Purpose: discover real Trillet purchase-number response shape so we can fix the
 * field mapping in provisionNumber without guessing.
 *
 * Run: node voice-provider/scripts/probe-purchase.js
 */

const path   = require('path');
const dotenv = require(path.join(__dirname, '../node_modules/dotenv'));

dotenv.config({ path: path.join(__dirname, '../../workers/.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const KEY = process.env.TRILLET_API_KEY;
const WID = process.env.TRILLET_WORKSPACE_ID;
const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const AREA = '610';

if (!KEY || !WID) { console.error('Missing TRILLET_API_KEY or TRILLET_WORKSPACE_ID'); process.exit(1); }

async function req(method, path, body) {
  const res  = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${JSON.stringify(json)}`);
  return json;
}

(async () => {
  // 1. Search — free
  console.log(`\n[1] Searching available numbers for area code ${AREA}…`);
  const search = await req('GET', `/twilio/available-numbers?country=US&type=local&areaCode=${AREA}&limit=3`);
  console.log('Search response:', JSON.stringify(search, null, 2));

  const nums = search.numbers || [];
  if (!nums.length) { console.error('No numbers found — cannot probe purchase.'); process.exit(1); }
  console.log(`\n    → ${nums.length} numbers found. Using: ${nums[0].phoneNumber}`);

  // 2. Purchase — ~$1/mo charge starts here; released below
  console.log('\n[2] Purchasing…');
  const purchase = await req('POST', '/twilio/purchase-number', {
    country: 'US', type: 'local', phoneNumber: nums[0].phoneNumber,
  });
  console.log('\n=== RAW PURCHASE RESPONSE ===');
  console.log(JSON.stringify(purchase, null, 2));
  console.log('=============================\n');

  // Extract whatever ID field exists — try common candidates
  const pn = purchase.phoneNumber ?? purchase.data ?? purchase;
  const numberId = pn?._id ?? pn?.id ?? pn?.sid ?? pn?.phoneNumberId ?? pn?.phoneNumberSid;
  console.log(`    → numberId candidates: _id=${pn?._id}  id=${pn?.id}  sid=${pn?.sid}`);
  console.log(`    → resolved numberId: ${numberId}`);

  // 3. Release immediately
  if (numberId) {
    console.log(`\n[3] Releasing ${numberId} immediately…`);
    const release = await req('POST', '/twilio/release-number', { phoneNumberId: numberId });
    console.log('Release response:', JSON.stringify(release, null, 2));
    console.log('\n✓ Number purchased, response captured, released. No ongoing charge.');
  } else {
    console.error('\n✗ Could not extract numberId — number may still be allocated. Check Trillet dashboard!');
    console.log('Full purchase object for manual ID extraction:', JSON.stringify(purchase, null, 2));
  }
})().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
