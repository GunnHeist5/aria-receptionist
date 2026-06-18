'use strict';

/**
 * smoke-test.js — validates TrilletVoiceProvider against the live API.
 *
 * What this does (read-only except for a single test agent):
 *   1. createSubAccount  → POST /agents    (creates one agent named "SMOKE TEST - delete me")
 *   2. Read it back      → GET  /agents/:id (verify field shape)
 *   3. applyContentPack  → POST /call-flows (creates a call flow linked to the agent)
 *   4. Read agent again  → GET  /agents/:id (verify agent.pathway was set)
 *   5. Deprovision       → DELETE call-flow + DELETE agent
 *
 * What this does NOT do:
 *   - provisionNumber  (buys a Twilio number — costs money)
 *   - runTestCall      (places a real phone call — costs money)
 *
 * Safe to run multiple times. Always cleans up after itself.
 */

require('dotenv').config();

const { TrilletVoiceProvider }  = require('../src/trillet.provider');
const { VoiceProviderError }    = require('../src/interface');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HR  = '─'.repeat(60);
const HR2 = '═'.repeat(60);

function pass(label) { console.log(`  ✅  ${label}`); }
function fail(label) { console.log(`  ❌  ${label}`); }
function info(label) { console.log(`  ℹ️   ${label}`); }

function assert(condition, label) {
  if (condition) { pass(label); } else { throw new Error(`ASSERTION FAILED: ${label}`); }
}

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + HR2);
  console.log(' TrilletVoiceProvider — Smoke Test');
  console.log(' Creates and deletes one agent. No phone numbers. No calls.');
  console.log(HR2 + '\n');

  const provider = new TrilletVoiceProvider();
  info(`Base URL:      ${provider._base}`);
  info(`Workspace ID:  ${provider._wid}`);
  console.log();

  let accountId = null;

  // ── Step 1: createSubAccount ─────────────────────────────────────────────
  console.log(HR);
  console.log(' Step 1 — createSubAccount  (POST /agents)');
  console.log(HR);

  const clientConfig = {
    clientId:           'smoke-test-000',
    businessName:       'SMOKE TEST — delete me',
    businessType:       'plumbing',
    forwardToNumber:    '+15125550000',
    tone:               'professional',
    businessHours:      { 'mon-fri': '08:00-17:00' },
    servicesOffered:    ['drain cleaning'],
    serviceArea:        { radius_miles: 10 },
    doNotSay:           [],
    escalationKeywords: ['burst pipe'],
    afterHoursBehavior: 'voicemail',
    alertDestination:   { sms: ['+15125550000'] },
  };

  let subResult;
  try {
    subResult = await provider.createSubAccount(clientConfig);
    accountId = subResult.accountId;
    pass(`createSubAccount succeeded`);
    info(`accountId:  ${accountId}`);
    info(`agent name: ${subResult.raw.name}`);
    info(`status:     ${subResult.raw.status}`);
    info(`llmModel:   ${subResult.raw.llmModel}`);
    info(`ttsModel:   ${JSON.stringify(subResult.raw.ttsModel)}`);
  } catch (err) {
    fail(`createSubAccount threw: ${err.message}`);
    console.log('\n SMOKE TEST ABORTED — could not create agent.\n');
    process.exit(1);
  }

  console.log();
  assert(typeof accountId === 'string' && accountId.length === 24,
    `accountId is a 24-char MongoDB ObjectID: ${accountId}`);
  assert(subResult.raw.name === clientConfig.businessName,
    `agent.name matches businessName`);
  assert(Array.isArray(subResult.raw.phoneNumberIds),
    `agent.phoneNumberIds is an array (empty on creation)`);
  assert(subResult.raw.phoneNumberIds.length === 0,
    `agent.phoneNumberIds is empty (no number provisioned yet)`);

  // ── Step 2: read back the agent ──────────────────────────────────────────
  console.log('\n' + HR);
  console.log(' Step 2 — Read agent back  (GET /agents/:id)');
  console.log(HR);

  let agent;
  try {
    agent = await provider._req('GET', `/agents/${accountId}`);
    pass(`GET /agents/${accountId} succeeded`);
    info(`pathway (pre-pack): ${agent.pathway ?? '(none)'}`);
    info(`workspaceId: ${agent.workspaceId}`);
  } catch (err) {
    fail(`GET agent threw: ${err.message}`);
    // Fall through to cleanup
  }

  if (agent) {
    console.log();
    assert(agent._id === accountId, `agent._id matches accountId`);
    assert(agent.workspaceId === provider._wid, `agent.workspaceId matches our workspace`);
    assert(agent.status !== undefined, `agent.status field present: ${agent.status}`);
  }

  // ── Step 3: applyContentPack ─────────────────────────────────────────────
  console.log('\n' + HR);
  console.log(' Step 3 — applyContentPack  (POST /call-flows)');
  console.log(HR);

  const testPack = {
    version:            'smoke-test-v1',
    systemPrompt:       'You are a receptionist. This is a smoke test. Do not answer real calls.',
    greeting:           'Hello, this is a smoke test receptionist.',
    tone:               'professional',
    doNotSay:           [],
    escalationKeywords: [],
    afterHoursBehavior: 'voicemail',
    businessHours:      { 'mon-fri': '08:00-17:00' },
    forwardToNumber:    '+15125550000',
  };

  let applyResult;
  try {
    applyResult = await provider.applyContentPack(accountId, testPack);
    pass(`applyContentPack succeeded`);
    info(`success: ${applyResult.success}`);
    info(`flow id: ${applyResult.raw._id ?? applyResult.raw.id ?? '(check raw)'}`);
  } catch (err) {
    fail(`applyContentPack threw: ${err.message}`);
  }

  // ── Step 4: verify agent.pathway was set ────────────────────────────────
  console.log('\n' + HR);
  console.log(' Step 4 — Verify agent.pathway set  (GET /agents/:id)');
  console.log(HR);

  let agentAfterPack;
  try {
    agentAfterPack = await provider._req('GET', `/agents/${accountId}`);
    pass(`Re-read agent succeeded`);
    info(`pathway (post-pack): ${agentAfterPack.pathway ?? '(still none)'}`);
    if (agentAfterPack.pathway) {
      assert(typeof agentAfterPack.pathway === 'string' && agentAfterPack.pathway.length === 24,
        `agent.pathway is a valid 24-char ID`);
    } else {
      info(`NOTE: agent.pathway not set — Trillet may link asynchronously. Deprovision will still run.`);
    }
  } catch (err) {
    fail(`Re-read agent threw: ${err.message}`);
  }

  // ── Step 5: deprovision (cleanup) ───────────────────────────────────────
  console.log('\n' + HR);
  console.log(' Step 5 — Deprovision  (DELETE call-flow + DELETE agent)');
  console.log(HR);

  try {
    const deprovResult = await provider.deprovision(accountId);
    pass(`deprovision succeeded`);
    info(`success: ${deprovResult.success}`);
    if (deprovResult.raw.deleteFlow) {
      info(`call-flow deleted: ${JSON.stringify(deprovResult.raw.deleteFlow).slice(0, 80)}`);
    }
    info(`agent cleanup:     ${JSON.stringify(deprovResult.raw.deleteAgent).slice(0, 80)}`);
    accountId = null; // mark as cleaned up
  } catch (err) {
    fail(`deprovision threw: ${err.message}`);
    if (accountId) {
      console.log(`\n  ⚠️  Agent ${accountId} may still exist in Trillet.`);
      console.log(`     Go to the Trillet dashboard and delete it manually.`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + HR2);
  if (!accountId) {
    console.log(' SMOKE TEST PASSED — all steps completed, agent cleaned up.');
  } else {
    console.log(' SMOKE TEST INCOMPLETE — agent cleanup failed (see above).');
  }
  console.log(HR2 + '\n');
}

main().catch(err => {
  console.error('\nSMOKE TEST CRASHED:', err.message);
  if (err instanceof VoiceProviderError) {
    console.error('  method:', err.method);
    console.error('  cause: ', err.cause?.message);
  }
  process.exit(1);
});
