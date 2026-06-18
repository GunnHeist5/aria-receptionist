'use strict';

/**
 * Checks all agents in your Trillet workspace and shows their phone numbers.
 * Run on VPS: node --env-file=/var/www/aria/.env scripts/trillet-check.js
 */

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) {
  console.error('Missing TRILLET_API_KEY or TRILLET_WORKSPACE_ID in env');
  process.exit(1);
}

async function req(path) {
  const res = await fetch(BASE + path, {
    headers: {
      'x-api-key':      KEY,
      'x-workspace-id': WID,
      'Accept':         'application/json',
    },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function main() {
  console.log('Fetching agents...\n');
  const agents = await req('/agents');
  const list   = Array.isArray(agents) ? agents : agents.data || agents.agents || [agents];

  if (!list.length) {
    console.log('No agents found in this workspace.');
    return;
  }

  console.log('Fetching phone numbers...\n');
  const numbers = await req('/twilio/user-phone-numbers');
  const numList = Array.isArray(numbers) ? numbers : [];

  for (const agent of list) {
    const numId    = (agent.phoneNumberIds || [])[0];
    const rawNumId = numId?._id ?? numId ?? null;
    const numObj   = rawNumId ? numList.find(n => n._id === rawNumId) : null;
    const phone    = numObj?.phoneNumber ?? null;

    console.log('─'.repeat(50));
    console.log(`Name:    ${agent.name}`);
    console.log(`ID:      ${agent._id}`);
    console.log(`Phone:   ${phone ?? '(none — needs a number provisioned)'}`);
    console.log(`Flow:    ${agent.pathway ?? '(no call flow)'}`);
    console.log(`Status:  ${agent.status ?? 'unknown'}`);
  }

  console.log('\n─'.repeat(50));
  console.log(`\nTotal agents: ${list.length}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
