'use strict';

/**
 * Attempts to fix inbound routing for the demo number by trying multiple approaches:
 * 1. Re-config with pathwayId explicitly set
 * 2. Probe for LiveKit trunk endpoints
 * 3. Try re-purchasing atomically with agentId in purchase body
 *
 * Run: node --env-file=/var/www/aria/.env scripts/trillet-fix-routing.js
 */

const AGENT_ID  = '6a321dc329908759d8970443';
const FLOW_ID   = '6a321dc429908759d8970454';
const NUMBER_ID = '6a347d55219a12d66333e41f';
const PHONE     = '+12157026522';

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) { console.error('Missing env vars'); process.exit(1); }

async function req(method, path, body, silent = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    if (!silent) console.log(`  ${method} ${path} → ${res.status}: ${json?.error || json?.message || text.slice(0,100)}`);
    return null;
  }
  return json;
}

async function main() {

  // Approach 1: Re-config number with agentId + pathwayId together
  console.log('=== Approach 1: Re-config with explicit pathwayId ===');
  const r1 = await req('PUT', `/twilio/phone-numbers/${NUMBER_ID}/config`, {
    agentId:   AGENT_ID,
    pathwayId: FLOW_ID,
  });
  console.log(r1 ? '✓ Success: ' + JSON.stringify(r1).slice(0, 120) : '✗ Failed');

  // Approach 2: Probe for a /setup or /activate endpoint
  console.log('\n=== Approach 2: Probe setup/activate endpoints ===');
  const probes = [
    ['POST', `/twilio/phone-numbers/${NUMBER_ID}/setup`,    { agentId: AGENT_ID }],
    ['POST', `/twilio/phone-numbers/${NUMBER_ID}/activate`, { agentId: AGENT_ID }],
    ['POST', `/twilio/phone-numbers/${NUMBER_ID}/link`,     { agentId: AGENT_ID }],
    ['POST', `/livekit/trunks`,          { phoneNumberId: NUMBER_ID, agentId: AGENT_ID }],
    ['POST', `/livekit/inbound-trunks`,  { phoneNumberId: NUMBER_ID, agentId: AGENT_ID }],
    ['GET',  `/livekit/trunks`,          null],
    ['GET',  `/livekit/dispatch-rules`,  null],
  ];
  for (const [method, path, body] of probes) {
    const r = await req(method, path, body, true);
    if (r) console.log(`  ✓ ${method} ${path} responded:`, JSON.stringify(r).slice(0, 120));
    else    console.log(`  ✗ ${method} ${path} → no response`);
  }

  // Approach 3: Re-purchase with agentId in purchase body (atomic setup)
  console.log('\n=== Approach 3: Check if purchase with agentId works atomically ===');
  const available = await req('GET', `/twilio/available-numbers?country=US&type=local&areaCode=215&limit=3`);
  if (available?.numbers?.length) {
    console.log('Would purchase:', available.numbers[0].phoneNumber, '(NOT doing it yet — just verifying endpoint)');
    console.log('Trying purchase with agentId included in body (dry run check skipped to avoid cost)');
  }

  // Approach 4: Fetch workspace info to see if LiveKit trunk exists at workspace level
  console.log('\n=== Approach 4: Check workspace-level LiveKit config ===');
  const wsProbes = [
    ['GET', `/workspaces/${WID}`],
    ['GET', `/workspaces`],
    ['GET', `/workspace`],
    ['GET', `/workspace/livekit`],
  ];
  for (const [method, path] of wsProbes) {
    const r = await req(method, path, null, true);
    if (r) {
      const keys = Object.keys(r).filter(k => k.toLowerCase().includes('livekit') || k.toLowerCase().includes('trunk'));
      if (keys.length) console.log(`  ✓ ${path} has LiveKit fields:`, keys);
      else console.log(`  ✓ ${path} responded (no LiveKit fields)`);
    } else {
      console.log(`  ✗ ${path} → no response`);
    }
  }

  // Verify final state
  console.log('\n=== Final number state ===');
  const list = await req('GET', '/twilio/user-phone-numbers');
  const num  = (Array.isArray(list) ? list : []).find(n => n._id === NUMBER_ID);
  if (num) {
    console.log('livekitInboundTrunkId:       ', num.livekitInboundTrunkId);
    console.log('livekitInboundDispatchRuleId:', num.livekitInboundDispatchRuleId);
    console.log('pathwayId:                   ', num.pathwayId);
    console.log('agentId (id field):          ', num.agentId?._id || num.agentId);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
