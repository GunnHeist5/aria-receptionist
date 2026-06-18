'use strict';

/**
 * Deep diagnostic: checks agent, call flow, and phone number config.
 * Run: node --env-file=/var/www/aria/.env scripts/trillet-diagnose.js
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
  if (!res.ok) { console.error(`  ERROR ${res.status}:`, json?.error || json?.message || text.slice(0, 200)); return null; }
  return json;
}

async function main() {
  console.log('=== AGENT ===');
  const agent = await req('GET', `/agents/${AGENT_ID}`);
  if (agent) {
    console.log('Name:          ', agent.name);
    console.log('Status:        ', agent.status);
    console.log('LLM:           ', agent.llmModel);
    console.log('TTS:           ', JSON.stringify(agent.ttsModel));
    console.log('Pathway:       ', agent.pathway);
    console.log('PhoneNumberIds:', JSON.stringify(agent.phoneNumberIds));
  }

  console.log('\n=== CALL FLOW ===');
  const flow = await req('GET', `/call-flows/${FLOW_ID}`);
  if (flow) {
    console.log('Name:          ', flow.name);
    console.log('IsActive:      ', flow.isActive);
    console.log('Direction:     ', flow.direction);
    console.log('WelcomeMsg:    ', flow.welcomeMessage);
    console.log('CustomGreeting:', flow.customWelcomeMessage?.slice(0, 80));
    console.log('Prompt (first 120 chars):', flow.prompt?.slice(0, 120));
  }

  console.log('\n=== PHONE NUMBER ===');
  const numConfig = await req('GET', `/twilio/phone-numbers/${NUMBER_ID}`);
  if (numConfig) {
    console.log('PhoneNumber:   ', numConfig.phoneNumber);
    console.log('Status:        ', numConfig.status);
    console.log('AgentId:       ', numConfig.agentId);
    console.log('WorkspaceId:   ', numConfig.workspaceId);
  }

  // Also try fetching from the list to cross-check
  console.log('\n=== NUMBER FROM LIST ===');
  const list = await req('GET', '/twilio/user-phone-numbers');
  const match = (Array.isArray(list) ? list : []).find(n => n._id === NUMBER_ID);
  if (match) {
    console.log('PhoneNumber:   ', match.phoneNumber);
    console.log('Status:        ', match.status);
    console.log('AgentId:       ', match.agentId);
  } else {
    console.log('Number not found in list — may not be active yet');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
