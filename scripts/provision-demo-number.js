'use strict';

/**
 * One-shot: provisions a 215 (Philadelphia) number for the Murphy's demo agent.
 * Run on VPS: node --env-file=/var/www/aria/.env scripts/provision-demo-number.js
 */

const AGENT_ID  = '6a321dc329908759d8970443';
const AREA_CODE = '215';

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) { console.error('Missing TRILLET_API_KEY or TRILLET_WORKSPACE_ID'); process.exit(1); }

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'x-api-key': KEY, 'x-workspace-id': WID,
      'Accept': 'application/json', 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error || json?.message || text.slice(0, 200)}`);
  return json;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // 1 — Search available numbers
  console.log(`Searching for available 215 numbers...`);
  const search = await req('GET', `/twilio/available-numbers?country=US&type=local&areaCode=${AREA_CODE}&limit=5`);
  const nums   = search.numbers || [];
  if (!nums.length) { console.error('No available numbers for 215. Try a different area code.'); process.exit(1); }
  console.log(`Found ${nums.length} available numbers. Purchasing ${nums[0].phoneNumber}...`);

  // 2 — Purchase
  const purchase = await req('POST', '/twilio/purchase-number', {
    country: 'US', type: 'local', phoneNumber: nums[0].phoneNumber,
  });
  const e164 = purchase.phoneNumber;
  console.log(`Purchased: ${e164}`);

  // 3 — Fetch numberId from list (can take a few seconds to appear)
  console.log('Waiting for number to appear in account...');
  const RECENT = Date.now() - 120_000;
  let numberId;
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(3000);
    const list  = await req('GET', '/twilio/user-phone-numbers');
    const match = (Array.isArray(list) ? list : [])
      .find(n => n.phoneNumber === e164 && n.workspaceId === WID && new Date(n.createdAt).getTime() > RECENT);
    if (match) { numberId = match._id; break; }
  }
  if (!numberId) { console.error('Could not retrieve numberId — check Trillet dashboard.'); process.exit(1); }
  console.log(`Number ID: ${numberId}`);

  // 4 — Link number to agent for inbound routing
  console.log('Linking number to demo agent...');
  await req('PUT', `/twilio/phone-numbers/${numberId}/config`, { agentId: AGENT_ID });

  // 5 — Record numberId on the agent
  const agent = await req('GET', `/agents/${AGENT_ID}`);
  const writable = ['name','llmModel','ttsModel','settings','phoneNumberIds','pathway'];
  const base = {};
  for (const f of writable) { if (agent[f] !== undefined) base[f] = agent[f]; }
  await req('PUT', `/agents/${AGENT_ID}`, { ...base, phoneNumberIds: [numberId] });

  console.log('\n✓ Done!');
  console.log(`Demo number: ${e164}`);
  console.log(`Call it now to test the bot.`);
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
