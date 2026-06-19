'use strict';

/**
 * Fixes the demo call flow: sets welcomeMessage + greeting, confirms routing.
 * Run: node --env-file=/var/www/aria/.env scripts/fix-demo-flow.js
 */

const AGENT_ID  = '6a321dc329908759d8970443';
const FLOW_ID   = '6a321dc429908759d8970454';
const NUMBER_ID = '6a347d55219a12d66333e41f';

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) { console.error('Missing env vars'); process.exit(1); }

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error || json?.message || text.slice(0, 200)}`);
  return json;
}

async function main() {
  // 1 — Fetch the existing flow so we preserve all its fields (PUT is full replace)
  console.log('Fetching existing call flow...');
  const flow = await req('GET', `/call-flows/${FLOW_ID}`);

  // 2 — Patch the welcome message fields which were missing
  const WRITABLE = ['name','direction','promptType','prompt','welcomeMessage',
                    'customWelcomeMessage','agent','settings','isActive'];
  const update = {};
  for (const f of WRITABLE) { if (flow[f] !== undefined) update[f] = flow[f]; }

  update.welcomeMessage       = 'ai_custom';
  update.customWelcomeMessage = "Thank you for calling Murphy's Plumbing, Heating and Air Conditioning. This is Aria, how can I help you today?";
  update.isActive             = true;

  console.log('Updating call flow with welcome message...');
  const updated = await req('PUT', `/call-flows/${FLOW_ID}`, update);
  console.log('Flow updated. isActive:', updated.isActive);
  console.log('WelcomeMsg:', updated.welcomeMessage);
  console.log('Greeting:', updated.customWelcomeMessage);

  // 3 — Re-link number to agent (force refresh)
  console.log('\nRe-linking number to agent...');
  await req('PUT', `/twilio/phone-numbers/${NUMBER_ID}/config`, { agentId: AGENT_ID });
  console.log('Number re-linked.');

  console.log('\n✓ Done. Wait 30 seconds then try calling +1 (215) 702-6522');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
