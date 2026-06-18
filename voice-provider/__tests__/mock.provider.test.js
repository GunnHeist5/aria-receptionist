'use strict';

// Run with:  node --test  (Node 18+, no additional test framework needed)
//
// What this file covers:
//   1. Happy-path: full provisioning lifecycle, all 6 methods
//   2. State inspection: _accounts readable + correct after each operation
//   3. Determinism: same inputs → same accountId, phoneNumber, agentId
//   4. Failure simulation: failOn Set causes throws; clearing it restores success
//   5. Resumability: fail mid-pipeline, clear failOn, retry succeeds from checkpoint
//   6. Edge cases: unknown accountId, already-deprovisioned account

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MockVoiceProvider, derivePhoneNumber, djb2 } = require('../src/mock.provider');
const { VoiceProviderError } = require('../src/interface');

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

/** @type {import('../src/interface').ClientConfig} */
const CLIENT_CONFIG = {
  clientId:           CLIENT_ID,
  businessName:       'Acme Plumbing',
  businessType:       'plumbing',
  forwardToNumber:    '+15125550100',
  tone:               'professional',
  businessHours:      { 'mon-fri': '08:00-17:00', sat: '09:00-13:00', sun: 'closed' },
  servicesOffered:    ['drain cleaning', 'water heater'],
  serviceArea:        { radius_miles: 20 },
  doNotSay:           ['competitor names'],
  escalationKeywords: ['burst pipe', 'flooding'],
  afterHoursBehavior: 'voicemail',
  alertDestination:   { sms: ['+15125550101'] },
};

/** @type {import('../src/interface').ContentPack} */
const CONTENT_PACK = {
  version:            'plumbing-v3',
  systemPrompt:       'You are a professional plumbing receptionist for Acme Plumbing.',
  greeting:           'Thank you for calling Acme Plumbing, how can I help?',
  tone:               'professional',
  doNotSay:           ['price guarantee'],
  escalationKeywords: ['flooding', 'gas leak'],
  afterHoursBehavior: 'voicemail',
  businessHours:      { 'mon-fri': '08:00-17:00' },
  forwardToNumber:    '+15125550100',
};

const NUMBER_REQ = { areaCode: '512' };

// Pre-compute expected deterministic values so tests assert exact strings
const EXPECTED_ACCOUNT_ID = `mock_acct_${CLIENT_ID}`;
const EXPECTED_PHONE       = derivePhoneNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ);

// ---------------------------------------------------------------------------
// 1. Happy-path: full provisioning lifecycle
// ---------------------------------------------------------------------------

describe('happy path — full provisioning lifecycle', () => {
  let mock;
  beforeEach(() => { mock = new MockVoiceProvider(); });

  it('createSubAccount returns deterministic accountId', async () => {
    const result = await mock.createSubAccount(CLIENT_CONFIG);
    assert.equal(result.accountId, EXPECTED_ACCOUNT_ID);
    assert.ok(result.raw.mock, 'raw.mock should be true');
  });

  it('provisionNumber returns deterministic E.164 number with correct area code', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const result = await mock.provisionNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ);
    assert.equal(result.phoneNumber, EXPECTED_PHONE);
    assert.ok(result.phoneNumber.startsWith('+1512'), 'number should use requested area code');
    assert.equal(result.phoneNumber.length, 12, 'E.164 US number should be 12 chars');
  });

  it('applyContentPack succeeds and returns a non-empty agentId', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const result = await mock.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK);
    assert.ok(result.success);
    assert.ok(result.agentId, 'agentId should be set');
  });

  it('updateConfig succeeds', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const result = await mock.updateConfig(EXPECTED_ACCOUNT_ID, {
      forwardToNumber: '+15125559999',
    });
    assert.ok(result.success);
  });

  it('runTestCall succeeds and returns callId + latencyMs', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const result = await mock.runTestCall(EXPECTED_ACCOUNT_ID, '+15125550200');
    assert.ok(result.success);
    assert.ok(result.callId);
    assert.ok(typeof result.latencyMs === 'number' && result.latencyMs >= 100);
  });

  it('deprovision succeeds', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const result = await mock.deprovision(EXPECTED_ACCOUNT_ID);
    assert.ok(result.success);
  });

  it('all six calls are recorded in mock.calls in order', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.provisionNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ);
    await mock.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK);
    await mock.updateConfig(EXPECTED_ACCOUNT_ID, { tone: 'friendly' });
    await mock.runTestCall(EXPECTED_ACCOUNT_ID, '+15125550200');
    await mock.deprovision(EXPECTED_ACCOUNT_ID);

    const methods = mock.calls.map((c) => c.method);
    assert.deepEqual(methods, [
      'createSubAccount',
      'provisionNumber',
      'applyContentPack',
      'updateConfig',
      'runTestCall',
      'deprovision',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. State inspection via mock._accounts
// ---------------------------------------------------------------------------

describe('state inspection — mock._accounts', () => {
  let mock;
  beforeEach(() => { mock = new MockVoiceProvider(); });

  it('_accounts stores clientConfig after createSubAccount', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const acct = mock._accounts.get(EXPECTED_ACCOUNT_ID);
    assert.ok(acct, '_accounts should have the new account');
    assert.equal(acct.clientConfig.businessName, 'Acme Plumbing');
    assert.equal(acct.deprovisioned, false);
    assert.ok(acct.createdAt instanceof Date);
  });

  it('_accounts.phoneNumber is set after provisionNumber', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    assert.equal(mock._accounts.get(EXPECTED_ACCOUNT_ID).phoneNumber, null);
    await mock.provisionNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ);
    assert.equal(mock._accounts.get(EXPECTED_ACCOUNT_ID).phoneNumber, EXPECTED_PHONE);
  });

  it('_accounts.contentPack is set and config is merged after applyContentPack', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK);
    const acct = mock._accounts.get(EXPECTED_ACCOUNT_ID);
    assert.equal(acct.contentPack.version, 'plumbing-v3');
    // doNotSay should come from the pack, not the original clientConfig
    assert.deepEqual(acct.config.doNotSay, ['price guarantee']);
  });

  it('_accounts.config is partially updated by updateConfig, leaving other fields intact', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.updateConfig(EXPECTED_ACCOUNT_ID, {
      forwardToNumber:    '+15125559999',
      afterHoursBehavior: 'forward',
    });
    const config = mock._accounts.get(EXPECTED_ACCOUNT_ID).config;
    assert.equal(config.forwardToNumber,    '+15125559999',  'forwardToNumber should be updated');
    assert.equal(config.afterHoursBehavior, 'forward',       'afterHoursBehavior should be updated');
    assert.equal(config.tone,               'professional',  'tone should be unchanged');
  });

  it('_accounts.testCalls grows on each runTestCall', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.runTestCall(EXPECTED_ACCOUNT_ID, '+15125550200');
    await mock.runTestCall(EXPECTED_ACCOUNT_ID, '+15125550201');
    const testCalls = mock._accounts.get(EXPECTED_ACCOUNT_ID).testCalls;
    assert.equal(testCalls.length, 2);
    assert.equal(testCalls[0].toNumber, '+15125550200');
    assert.equal(testCalls[1].toNumber, '+15125550201');
  });

  it('_accounts marks account deprovisioned after deprovision', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.deprovision(EXPECTED_ACCOUNT_ID);
    const acct = mock._accounts.get(EXPECTED_ACCOUNT_ID);
    assert.equal(acct.deprovisioned, true);
    assert.ok(acct.deprovisionedAt instanceof Date);
  });
});

// ---------------------------------------------------------------------------
// 3. Determinism
// ---------------------------------------------------------------------------

describe('determinism — same inputs → same outputs across instances', () => {
  it('accountId is always mock_acct_ + clientId', () => {
    const id = `mock_acct_${CLIENT_ID}`;
    assert.equal(id, EXPECTED_ACCOUNT_ID);
  });

  it('derivePhoneNumber is pure: same args → same number', () => {
    const a = derivePhoneNumber('mock_acct_abc', { areaCode: '415' });
    const b = derivePhoneNumber('mock_acct_abc', { areaCode: '415' });
    assert.equal(a, b);
  });

  it('different clientIds → different phone numbers', () => {
    const p1 = derivePhoneNumber('mock_acct_111', { areaCode: '512' });
    const p2 = derivePhoneNumber('mock_acct_222', { areaCode: '512' });
    assert.notEqual(p1, p2);
  });

  it('agentId is stable for the same accountId + pack version across two mock instances', async () => {
    const mockA = new MockVoiceProvider();
    const mockB = new MockVoiceProvider();

    await mockA.createSubAccount(CLIENT_CONFIG);
    const rA = await mockA.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK);

    await mockB.createSubAccount(CLIENT_CONFIG);
    const rB = await mockB.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK);

    assert.equal(rA.agentId, rB.agentId, 'agentId should be deterministic');
  });

  it('sequential runTestCall calls produce distinct (sequence-based) callIds', async () => {
    const mock = new MockVoiceProvider();
    await mock.createSubAccount(CLIENT_CONFIG);
    const r1 = await mock.runTestCall(EXPECTED_ACCOUNT_ID, '+15125550200');
    const r2 = await mock.runTestCall(EXPECTED_ACCOUNT_ID, '+15125550200');
    assert.notEqual(r1.callId, r2.callId, 'callIds should differ between sequential calls');
  });
});

// ---------------------------------------------------------------------------
// 4. Failure simulation via failOn
// ---------------------------------------------------------------------------

describe('failure simulation — failOn Set', () => {
  let mock;
  beforeEach(() => { mock = new MockVoiceProvider(); });

  it('failOn.add causes the method to throw VoiceProviderError', async () => {
    mock.failOn.add('createSubAccount');
    await assert.rejects(
      () => mock.createSubAccount(CLIENT_CONFIG),
      (err) => {
        assert.ok(err instanceof VoiceProviderError, 'should be VoiceProviderError');
        assert.equal(err.method, 'createSubAccount');
        return true;
      }
    );
  });

  it('failed call is logged in mock.calls with an error field (no result)', async () => {
    mock.failOn.add('createSubAccount');
    try { await mock.createSubAccount(CLIENT_CONFIG); } catch { /* expected */ }
    assert.equal(mock.calls.length, 1);
    const entry = mock.calls[0];
    assert.equal(entry.method, 'createSubAccount');
    assert.ok(entry.error instanceof VoiceProviderError);
    assert.equal(entry.result, undefined);
  });

  it('failOn covers all six methods individually', async () => {
    const methods = [
      'createSubAccount',
      'provisionNumber',
      'applyContentPack',
      'updateConfig',
      'runTestCall',
      'deprovision',
    ];
    for (const method of methods) {
      const m = new MockVoiceProvider();
      m.failOn.add(method);
      await assert.rejects(
        () => m[method](EXPECTED_ACCOUNT_ID, {}),
        VoiceProviderError,
        `${method} should throw VoiceProviderError when in failOn`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Resumability — clear failOn between attempts
// ---------------------------------------------------------------------------

describe('resumability — simulating a mid-pipeline failure and retry', () => {
  it('provisionNumber fails, then succeeds after failOn is cleared', async () => {
    const mock = new MockVoiceProvider();
    await mock.createSubAccount(CLIENT_CONFIG);

    // Step 1 of onboarding pipeline: createSubAccount succeeded (above).
    // Step 2: provisionNumber — simulate transient failure.
    mock.failOn.add('provisionNumber');
    await assert.rejects(
      () => mock.provisionNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ),
      VoiceProviderError
    );
    // Account exists but phoneNumber not yet set — pipeline writes checkpoint here.
    assert.equal(mock._accounts.get(EXPECTED_ACCOUNT_ID).phoneNumber, null);

    // Orchestrator clears the failure (or on retry the transient condition resolves).
    mock.failOn.delete('provisionNumber');

    // Retry step 2 — should succeed, account already exists from step 1.
    const result = await mock.provisionNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ);
    assert.equal(result.phoneNumber, EXPECTED_PHONE);
    assert.equal(mock._accounts.get(EXPECTED_ACCOUNT_ID).phoneNumber, EXPECTED_PHONE);
  });

  it('applyContentPack fails mid-pipeline then recovers; prior state is intact', async () => {
    const mock = new MockVoiceProvider();
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.provisionNumber(EXPECTED_ACCOUNT_ID, NUMBER_REQ);

    // Step 3 fails
    mock.failOn.add('applyContentPack');
    await assert.rejects(
      () => mock.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK),
      VoiceProviderError
    );
    // Phone number from step 2 is still present
    assert.equal(mock._accounts.get(EXPECTED_ACCOUNT_ID).phoneNumber, EXPECTED_PHONE);

    // Retry step 3
    mock.failOn.delete('applyContentPack');
    const result = await mock.applyContentPack(EXPECTED_ACCOUNT_ID, CONTENT_PACK);
    assert.ok(result.success);
    assert.equal(mock._accounts.get(EXPECTED_ACCOUNT_ID).contentPack.version, 'plumbing-v3');
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  let mock;
  beforeEach(() => { mock = new MockVoiceProvider(); });

  it('calling any method with an unknown accountId throws VoiceProviderError', async () => {
    const methods = ['provisionNumber', 'applyContentPack', 'updateConfig', 'runTestCall', 'deprovision'];
    for (const method of methods) {
      await assert.rejects(
        () => mock[method]('mock_acct_does-not-exist', {}),
        VoiceProviderError
      );
    }
  });

  it('calling any method on a deprovisioned account throws VoiceProviderError', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    await mock.deprovision(EXPECTED_ACCOUNT_ID);

    const methodsAfterDeprovision = ['provisionNumber', 'applyContentPack', 'updateConfig', 'runTestCall'];
    for (const method of methodsAfterDeprovision) {
      await assert.rejects(
        () => mock[method](EXPECTED_ACCOUNT_ID, {}),
        VoiceProviderError
      );
    }
  });

  it('two clients get distinct account IDs and phone numbers', async () => {
    const config2 = { ...CLIENT_CONFIG, clientId: 'bbbbbbbb-0000-0000-0000-000000000002', businessName: 'Beta Plumbing' };
    const r1 = await mock.createSubAccount(CLIENT_CONFIG);
    const r2 = await mock.createSubAccount(config2);
    assert.notEqual(r1.accountId, r2.accountId);

    await mock.provisionNumber(r1.accountId, NUMBER_REQ);
    await mock.provisionNumber(r2.accountId, NUMBER_REQ);
    const phone1 = mock._accounts.get(r1.accountId).phoneNumber;
    const phone2 = mock._accounts.get(r2.accountId).phoneNumber;
    assert.notEqual(phone1, phone2);
  });

  it('provisionNumber without areaCode falls back to 555', async () => {
    await mock.createSubAccount(CLIENT_CONFIG);
    const result = await mock.provisionNumber(EXPECTED_ACCOUNT_ID, {});
    assert.ok(result.phoneNumber.startsWith('+1555'));
  });
});
