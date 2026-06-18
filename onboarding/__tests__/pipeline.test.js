'use strict';

// Run with:  node --test  (Node 18+)
//
// Scenarios covered:
//   1. Happy path     — all 5 steps run, client ends up 'live', run 'completed'
//   2. Checkpoint     — pre-populated steps_completed are skipped
//   3. Failure        — step throws, run marked 'failed', failure event written
//   4. Resume         — retry of a failed run resets to 'running', skips done steps
//   5. Guard: live    — runOnboarding throws if client already 'live'
//   6. Guard: done    — runOnboarding throws if run already 'completed'
//   7. Test-call skip — no TEST_CALL_NUMBER → step skips gracefully, pipeline continues

const { describe, it, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { runOnboarding }     = require('../src/index');
const { MockVoiceProvider } = require('../../voice-provider/src/mock.provider');
const { VoiceProviderError } = require('../../voice-provider/src/interface');

// ---------------------------------------------------------------------------
// MemDb — in-memory pg.Pool substitute
// Implements query(sql, params) and exposes state for assertions.
// Handles exactly the SQL patterns emitted by pipeline.js.
// ---------------------------------------------------------------------------

class MemDb {
  constructor({ clients = [], runs = [] } = {}) {
    this._clients = clients.map(c => ({ ...c }));
    this._runs    = runs.map(r => ({ ...r }));
    this._events  = [];
    this._seq     = 1;
  }

  // -- accessors for test inspection ----------------------------------------
  get events()                 { return this._events; }
  client(id)                   { return this._clients.find(c => c.id === id); }
  latestRun(clientId)          {
    return [...this._runs]
      .filter(r => r.client_id === clientId)
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
  }
  eventsForStep(stepKey) {
    return this._events.filter(e => e.payload && e.payload.step === stepKey);
  }

  async query(sql, params = []) {
    const s = sql.trim();

    // SELECT * FROM clients WHERE id = $1
    if (/SELECT \* FROM clients WHERE id/i.test(s)) {
      const row = this._clients.find(c => c.id === params[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    // SELECT * FROM onboarding_runs WHERE client_id = $1 ...
    if (/SELECT \* FROM onboarding_runs/i.test(s)) {
      const rows = this._runs
        .filter(r => r.client_id === params[0])
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
      return { rows: rows.slice(0, 1).map(r => ({ ...r })), rowCount: rows.length };
    }

    // INSERT INTO onboarding_runs ... RETURNING *
    if (/INSERT INTO onboarding_runs/i.test(s)) {
      const run = {
        id:              `run-${this._seq++}`,
        client_id:       params[0],
        status:          'running',
        current_step:    null,
        steps_completed: [],
        error:           null,
        started_at:      new Date(),
        completed_at:    null,
      };
      this._runs.push(run);
      return { rows: [{ ...run }], rowCount: 1 };
    }

    // UPDATE clients SET col = $2, ... WHERE id = $1
    if (/UPDATE clients SET/i.test(s)) {
      const clientId = params[0];
      const row = this._clients.find(c => c.id === clientId);
      if (!row) return { rows: [], rowCount: 0 };
      const setClause = s.match(/SET\s+(.+?)\s+WHERE/i)?.[1] || '';
      for (const part of setClause.split(',').map(p => p.trim())) {
        const m = part.match(/^(\w+)\s*=\s*\$(\d+)/i);
        if (m) {
          const col   = m[1];
          const idx   = parseInt(m[2]) - 1; // 0-based index into params
          const raw   = params[idx];
          // Auto-parse JSON strings for jsonb column inspection in tests
          row[col] = (typeof raw === 'string' && /^[\[{]/.test(raw))
            ? (() => { try { return JSON.parse(raw); } catch { return raw; } })()
            : raw;
        }
      }
      return { rows: [], rowCount: 1 };
    }

    // INSERT INTO events ...
    if (/INSERT INTO events/i.test(s)) {
      const payload = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
      this._events.push({
        id:         `evt-${this._seq++}`,
        client_id:  params[0],
        type:       'provisioning_step',
        payload,
        created_at: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    // UPDATE onboarding_runs SET steps_completed = steps_completed || $2::jsonb ...
    if (/steps_completed = steps_completed \|\|/i.test(s)) {
      const run = this._runs.find(r => r.id === params[0]);
      if (run) {
        const added = JSON.parse(params[1]);
        run.steps_completed = [...(run.steps_completed || []), ...added];
        run.current_step    = params[2];
      }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE onboarding_runs SET status = 'running' (reset)
    if (/UPDATE onboarding_runs/i.test(s) && /status\s*=\s*'running'/i.test(s)) {
      const run = this._runs.find(r => r.id === params[0]);
      if (run) { run.status = 'running'; run.error = null; }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE onboarding_runs SET status = 'failed'
    if (/UPDATE onboarding_runs/i.test(s) && /status\s*=\s*'failed'/i.test(s)) {
      const run = this._runs.find(r => r.id === params[0]);
      if (run) { run.status = 'failed'; run.current_step = params[1]; run.error = params[2]; }
      return { rows: [], rowCount: 1 };
    }

    // UPDATE onboarding_runs SET status = 'completed'
    if (/UPDATE onboarding_runs/i.test(s) && /status\s*=\s*'completed'/i.test(s)) {
      const run = this._runs.find(r => r.id === params[0]);
      if (run) { run.status = 'completed'; run.current_step = params[1]; run.completed_at = new Date(); }
      return { rows: [], rowCount: 1 };
    }

    process.stdout.write(`[MemDb] WARN unhandled query: ${s.slice(0, 100)}\n`);
    return { rows: [], rowCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = 'client-0001-0000-0000-000000000001';

/** A 'won' client ready for onboarding */
function makeClient(overrides = {}) {
  return {
    id:                         CLIENT_ID,
    status:                     'won',
    business_name:              'Test Plumbing Co',
    business_type:              'plumbing',
    phone:                      '+15125550100',
    email:                      'test@plumbing.example',
    city:                       'Austin',
    state:                      'TX',
    forward_to_number:          '+15125550199',
    tone:                       'professional',
    business_hours:             { 'mon-fri': '08:00-17:00' },
    services_offered:           ['drain cleaning', 'leak repair'],
    service_area:               { radius_miles: 20 },
    do_not_say:                 ['cheapest in town'],
    escalation_keywords:        ['burst pipe', 'flooding'],
    after_hours_behavior:       'voicemail',
    alert_destination:          { sms: ['+15125550101'] },
    // provisioning fields — null until pipeline fills them
    voice_provider:             null,
    voice_provider_account_id:  null,
    provisioned_number:         null,
    content_pack_version:       null,
    provisioning_checkpoint:    null,
    activated_at:               null,
    billing_status:             'none',
    ...overrides,
  };
}

/** The mock_acct_ id the MockVoiceProvider will generate for CLIENT_ID */
const EXPECTED_ACCOUNT_ID = `mock_acct_${CLIENT_ID}`;

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe('happy path — all five steps run to completion', () => {
  let db, mock;

  beforeEach(() => {
    delete process.env.TEST_CALL_NUMBER;
    db   = new MemDb({ clients: [makeClient()] });
    mock = new MockVoiceProvider();
  });

  it('runOnboarding returns a runId', async () => {
    const result = await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.ok(result.runId, 'should return a runId');
  });

  it('client.status is live after pipeline', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.equal(db.client(CLIENT_ID).status, 'live');
  });

  it('client.voice_provider_account_id is set', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.equal(db.client(CLIENT_ID).voice_provider_account_id, EXPECTED_ACCOUNT_ID);
  });

  it('client.provisioned_number is a valid E.164 US number', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    const num = db.client(CLIENT_ID).provisioned_number;
    assert.match(num, /^\+1\d{10}$/, 'provisioned_number should be E.164');
  });

  it('client.content_pack_version is plumbing-v1', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.equal(db.client(CLIENT_ID).content_pack_version, 'plumbing-v1');
  });

  it('client.billing_status is pending', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.equal(db.client(CLIENT_ID).billing_status, 'pending');
  });

  it('client.activated_at is set', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.ok(db.client(CLIENT_ID).activated_at, 'activated_at should be set');
  });

  it('onboarding_run.status is completed', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    assert.equal(db.latestRun(CLIENT_ID).status, 'completed');
  });

  it('onboarding_run.steps_completed contains all five step keys', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    const done = db.latestRun(CLIENT_ID).steps_completed;
    assert.deepEqual(done, [
      'create_account', 'provision_number', 'apply_content_pack', 'run_test_call', 'activate',
    ]);
  });

  it('a provisioning_step event is written for each step', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    const steps = db.events.map(e => e.payload.step);
    assert.ok(steps.includes('create_account'));
    assert.ok(steps.includes('provision_number'));
    assert.ok(steps.includes('apply_content_pack'));
    assert.ok(steps.includes('run_test_call'));
    assert.ok(steps.includes('activate'));
  });

  it('no event has type payment_failed — wrong domain for provisioning', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    const bad = db.events.filter(e => e.type === 'payment_failed');
    assert.equal(bad.length, 0, 'provisioning events must never use payment_failed type');
  });

  it('MockVoiceProvider._accounts reflects the full provisioned state', async () => {
    await runOnboarding(CLIENT_ID, { db, provider: mock });
    const acct = mock._accounts.get(EXPECTED_ACCOUNT_ID);
    assert.ok(acct, 'mock account should exist');
    assert.ok(acct.phoneNumber, 'mock account should have a phone number');
    assert.equal(acct.contentPack.version, 'plumbing-v1');
    assert.equal(acct.deprovisioned, false);
  });
});

// ---------------------------------------------------------------------------
// 2. Checkpoint / resume from partial run
// ---------------------------------------------------------------------------

describe('checkpoint — pre-completed steps are skipped', () => {
  it('skips create_account and provision_number if already in steps_completed', async () => {
    const accountId = EXPECTED_ACCOUNT_ID;
    const phoneNum  = '+15125550001';

    // Seed DB as if the first two steps already ran
    const client = makeClient({
      voice_provider:            'mock',
      voice_provider_account_id: accountId,
      provisioned_number:        phoneNum,
    });
    const existingRun = {
      id:              'run-existing',
      client_id:       CLIENT_ID,
      status:          'running',
      current_step:    'provision_number',
      steps_completed: ['create_account', 'provision_number'],
      error:           null,
      started_at:      new Date(),
      completed_at:    null,
    };
    const db   = new MemDb({ clients: [client], runs: [existingRun] });
    const mock = new MockVoiceProvider();

    // Pre-populate the mock's state so steps 3-5 can find the account
    mock._accounts.set(accountId, {
      clientConfig:    {},
      phoneNumber:     phoneNum,
      numberId:        'mock_num_123',
      contentPack:     null,
      config:          {},
      testCalls:       [],
      deprovisioned:   false,
      deprovisionedAt: null,
      createdAt:       new Date(),
    });

    await runOnboarding(CLIENT_ID, { db, provider: mock });

    // Only steps 3-5 should have been called on the provider
    const calledMethods = mock.calls.map(c => c.method);
    assert.ok(!calledMethods.includes('createSubAccount'),  'createSubAccount should be skipped');
    assert.ok(!calledMethods.includes('provisionNumber'),   'provisionNumber should be skipped');
    assert.ok(calledMethods.includes('applyContentPack'),   'applyContentPack should run');

    // Run should be completed
    assert.equal(db.latestRun(CLIENT_ID).status, 'completed');
  });
});

// ---------------------------------------------------------------------------
// 3. Failure — step throws, run is marked failed
// ---------------------------------------------------------------------------

describe('failure — step error writes failure event and marks run failed', () => {
  it('provisionNumber failure marks run failed and writes a failure event', async () => {
    const db   = new MemDb({ clients: [makeClient()] });
    const mock = new MockVoiceProvider();
    mock.failOn.add('provisionNumber');

    await assert.rejects(
      () => runOnboarding(CLIENT_ID, { db, provider: mock }),
      (err) => {
        assert.ok(err instanceof VoiceProviderError || err instanceof Error);
        return true;
      }
    );

    const run = db.latestRun(CLIENT_ID);
    assert.equal(run.status, 'failed');
    assert.equal(run.current_step, 'provision_number');
    assert.ok(run.error, 'run.error should be set');

    // Failure event written
    const failEvt = db.events.find(e => e.payload.status === 'failed');
    assert.ok(failEvt, 'a failure event should be written');
    assert.equal(failEvt.payload.step, 'provision_number');
    assert.equal(failEvt.type, 'provisioning_step', 'failure event must be provisioning_step, never payment_failed');

    // Client never went live
    assert.notEqual(db.client(CLIENT_ID).status, 'live');
  });

  it('create_account failure — no voice_provider_account_id written', async () => {
    const db   = new MemDb({ clients: [makeClient()] });
    const mock = new MockVoiceProvider();
    mock.failOn.add('createSubAccount');

    await assert.rejects(() => runOnboarding(CLIENT_ID, { db, provider: mock }));
    assert.equal(db.client(CLIENT_ID).voice_provider_account_id, null);
  });
});

// ---------------------------------------------------------------------------
// 4. Resume — retry of a failed run resets and skips completed steps
// ---------------------------------------------------------------------------

describe('resume — failed run resets to running, skips done steps on retry', () => {
  it('run is reset to running and pipeline completes on retry', async () => {
    const db   = new MemDb({ clients: [makeClient()] });
    const mock = new MockVoiceProvider();

    // First attempt: fails at provisionNumber
    mock.failOn.add('provisionNumber');
    await assert.rejects(() => runOnboarding(CLIENT_ID, { db, provider: mock }));

    assert.equal(db.latestRun(CLIENT_ID).status, 'failed');
    const doneAfterFail = [...(db.latestRun(CLIENT_ID).steps_completed || [])];
    assert.ok(doneAfterFail.includes('create_account'), 'create_account should be checkpointed');
    assert.ok(!doneAfterFail.includes('provision_number'), 'provision_number should not be checkpointed');

    // Clear failure flag → second attempt
    mock.failOn.delete('provisionNumber');
    await runOnboarding(CLIENT_ID, { db, provider: mock });

    // Run is now completed
    assert.equal(db.latestRun(CLIENT_ID).status, 'completed');
    assert.equal(db.client(CLIENT_ID).status, 'live');

    // createSubAccount was called exactly once (not twice — resume skipped it)
    const createCalls = mock.calls.filter(c => c.method === 'createSubAccount');
    assert.equal(createCalls.length, 1, 'createSubAccount should be called exactly once across both runs');
  });
});

// ---------------------------------------------------------------------------
// 5. Guard — already-live client
// ---------------------------------------------------------------------------

describe('guard — pipeline refuses to run on blocked client statuses', () => {
  for (const blockedStatus of ['live', 'paused', 'churned']) {
    it(`throws if client.status is '${blockedStatus}'`, async () => {
      const db   = new MemDb({ clients: [makeClient({ status: blockedStatus })] });
      const mock = new MockVoiceProvider();
      await assert.rejects(
        () => runOnboarding(CLIENT_ID, { db, provider: mock }),
        (err) => {
          assert.ok(err.message.includes(blockedStatus));
          return true;
        }
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Guard — already-completed run
// ---------------------------------------------------------------------------

describe('guard — already-completed run throws', () => {
  it('throws if the most recent onboarding_run is already completed', async () => {
    const completedRun = {
      id:              'run-done',
      client_id:       CLIENT_ID,
      status:          'completed',
      current_step:    'activate',
      steps_completed: ['create_account','provision_number','apply_content_pack','run_test_call','activate'],
      error:           null,
      started_at:      new Date(),
      completed_at:    new Date(),
    };
    const db   = new MemDb({ clients: [makeClient()], runs: [completedRun] });
    const mock = new MockVoiceProvider();
    await assert.rejects(
      () => runOnboarding(CLIENT_ID, { db, provider: mock }),
      (err) => {
        assert.ok(err.message.includes('already completed'));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Test-call skip — no TEST_CALL_NUMBER → graceful skip, pipeline continues
// ---------------------------------------------------------------------------

describe('test-call step — graceful skip when TEST_CALL_NUMBER is not set', () => {
  before(()  => { delete process.env.TEST_CALL_NUMBER; });
  after(()   => { delete process.env.TEST_CALL_NUMBER; });

  it('pipeline completes without calling provider.runTestCall', async () => {
    const db   = new MemDb({ clients: [makeClient()] });
    const mock = new MockVoiceProvider();

    await runOnboarding(CLIENT_ID, { db, provider: mock });

    const testCallCalls = mock.calls.filter(c => c.method === 'runTestCall');
    assert.equal(testCallCalls.length, 0, 'runTestCall should not be called when no test number');
    assert.equal(db.client(CLIENT_ID).status, 'live', 'pipeline should still complete');
  });

  it('writes a skipped event for the run_test_call step', async () => {
    const db   = new MemDb({ clients: [makeClient()] });
    const mock = new MockVoiceProvider();

    await runOnboarding(CLIENT_ID, { db, provider: mock });

    const skipEvt = db.events.find(e => e.payload.step === 'run_test_call' && e.payload.skipped);
    assert.ok(skipEvt, 'a skipped event should be written for run_test_call');
    assert.ok(skipEvt.payload.reason, 'skip event should include a reason');
  });

  it('when TEST_CALL_NUMBER IS set, provider.runTestCall is called', async () => {
    process.env.TEST_CALL_NUMBER = '+15125550911';
    const db   = new MemDb({ clients: [makeClient()] });
    const mock = new MockVoiceProvider();

    await runOnboarding(CLIENT_ID, { db, provider: mock });

    const testCallCalls = mock.calls.filter(c => c.method === 'runTestCall');
    assert.equal(testCallCalls.length, 1, 'runTestCall should be called when TEST_CALL_NUMBER is set');
    delete process.env.TEST_CALL_NUMBER;
  });
});
