'use strict';
// Dump a Trillet agent's voice/LLM/settings + its call-flow settings, so you can
// copy the exact field names/values you tuned in the dashboard into TRILLET_* env
// vars (especially TRILLET_AGENT_SETTINGS_JSON / TRILLET_CALL_SETTINGS_JSON) and
// have every NEW agent created with those same tuned values.
//   node --env-file=.env scripts/trillet-agent-dump.js <agentId>

const key  = (process.env.TRILLET_API_KEY || '').trim();
const wid  = (process.env.TRILLET_WORKSPACE_ID || '').trim();
const base = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';

async function req(path) {
  const r = await fetch(base + path, {
    headers: { 'x-api-key': key, 'x-workspace-id': wid, 'Accept': 'application/json' },
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  return j;
}

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: node --env-file=.env scripts/trillet-agent-dump.js <agentId>'); process.exit(1); }

  const agent = await req('/agents/' + id);
  console.log('AGENT (voice / brain / settings):');
  console.log(JSON.stringify({ name: agent.name, llmModel: agent.llmModel, ttsModel: agent.ttsModel, settings: agent.settings }, null, 2));

  if (agent.pathway) {
    const flow = await req('/call-flows/' + agent.pathway);
    console.log('\nCALL FLOW settings:');
    console.log(JSON.stringify(flow.settings, null, 2));
  }

  console.log('\nTip: copy ttsModel/voiceId/llmModel/speed into the TRILLET_* env vars, and any');
  console.log('extra tuning (interruption, turn detection, responsiveness) into');
  console.log('TRILLET_AGENT_SETTINGS_JSON / TRILLET_CALL_SETTINGS_JSON, to lock them for every new agent.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
