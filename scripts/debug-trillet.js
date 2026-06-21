'use strict';
// node --env-file=/var/www/aria/.env scripts/debug-trillet.js
// Shows the exact state of the Murphy's Plumbing agent + number in Trillet

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE  = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY   = process.env.TRILLET_API_KEY;
const WID   = process.env.TRILLET_WORKSPACE_ID;

async function req(method, path, body) {
  const res  = await fetch(BASE + path, {
    method,
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, ok: res.ok, data: JSON.parse(text) }; }
  catch { return { status: res.status, ok: res.ok, data: text }; }
}

async function main() {
  // Find Murphy's test client in DB
  const { rows: [client] } = await pool.query(
    `SELECT id, business_name, provisioned_number, voice_provider_account_id
     FROM clients WHERE business_name = $1 AND source = 'test' ORDER BY created_at DESC LIMIT 1`,
    ["Murphy's Plumbing"]
  );

  if (!client) { console.log('No Murphy test client found in DB.'); await pool.end(); return; }

  console.log('\n── DB ─────────────────────────────────────────────');
  console.log('Client ID:   ', client.id);
  console.log('Agent ID:    ', client.voice_provider_account_id);
  console.log('Number:      ', client.provisioned_number);

  const agentId = client.voice_provider_account_id;

  // Fetch agent from Trillet
  console.log('\n── Trillet Agent ──────────────────────────────────');
  const agent = await req('GET', `/agents/${agentId}`);
  console.log('Status:', agent.status);
  if (agent.ok) {
    console.log('Name:        ', agent.data.name);
    console.log('phoneNumberIds:', JSON.stringify(agent.data.phoneNumberIds));
    console.log('pathway:     ', agent.data.pathway);
  } else {
    console.log('ERROR:', JSON.stringify(agent.data));
  }

  // Fetch all numbers and find ours
  console.log('\n── Trillet Phone Numbers ──────────────────────────');
  const nums = await req('GET', '/twilio/user-phone-numbers');
  if (nums.ok) {
    const all = Array.isArray(nums.data) ? nums.data : [];
    const ours = all.find(n => n.phoneNumber === client.provisioned_number);
    if (ours) {
      console.log('Found number:', ours.phoneNumber);
      console.log('Number ID:  ', ours._id);
      console.log('Status:     ', ours.status);
      console.log('agentId:    ', ours.agentId ?? '(not set)');
      console.log('Full record:', JSON.stringify(ours, null, 2));

      // Try attaching it now
      if (!ours.agentId || ours.agentId !== agentId) {
        console.log('\n── Attaching number to agent ──────────────────────');
        console.log(`PUT /twilio/phone-numbers/${ours._id}/config  { agentId: ${agentId} }`);
        const attach = await req('PUT', `/twilio/phone-numbers/${ours._id}/config`, { agentId });
        console.log('Response status:', attach.status);
        console.log('Response body: ', JSON.stringify(attach.data, null, 2));
      } else {
        console.log('\n✓ Number already has agentId set correctly');
      }
    } else {
      console.log(`Number ${client.provisioned_number} not found in workspace.`);
      console.log('All numbers in workspace:');
      all.forEach(n => console.log(' ', n.phoneNumber, n.status, 'agentId:', n.agentId ?? 'none'));
    }
  } else {
    console.log('ERROR fetching numbers:', JSON.stringify(nums.data));
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
