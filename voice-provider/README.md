# voice-provider

The single isolated seam where the voice vendor plugs in to the AI-receptionist platform.

The rest of the system depends **only on the interface** — never on a specific vendor.
Swapping Trillet for another provider means rewriting one file (`trillet.provider.js`)
with no other code changes.

---

## Setup

```bash
cd voice-provider
cp .env.example .env
npm install          # installs dotenv (only dependency; no test framework needed)
```

Set `VOICE_PROVIDER` in `.env`:

| Value     | What runs                      | When to use              |
|-----------|-------------------------------|--------------------------|
| `mock`    | MockVoiceProvider (default)    | All dev and test work    |
| `trillet` | TrilletVoiceProvider           | Production only          |

---

## Running tests

```bash
npm test
```

Uses Node's built-in test runner (`node --test`). No Jest, no Mocha — requires Node ≥ 18.

---

## Usage

```js
const { createVoiceProvider } = require('./voice-provider/src');

const provider = createVoiceProvider(); // reads VOICE_PROVIDER from env

// Full provisioning lifecycle (same calls whether mock or real):
const { accountId } = await provider.createSubAccount(clientConfig);
const { phoneNumber } = await provider.provisionNumber(accountId, { areaCode: '512' });
await provider.applyContentPack(accountId, contentPack);
const { success, latencyMs } = await provider.runTestCall(accountId, '+15125550001');

// Live config change (no re-provisioning):
await provider.updateConfig(accountId, { forwardToNumber: '+15125559999' });

// Churn:
await provider.deprovision(accountId);
```

All methods throw `VoiceProviderError` on failure. Callers must catch and write a
`provisioning_step` event to the `events` table — **never** `payment_failed`, which
is reserved for Stripe/billing concerns.

```js
const { VoiceProviderError } = require('./voice-provider/src/interface');

try {
  await provider.provisionNumber(accountId, req);
} catch (err) {
  if (err instanceof VoiceProviderError) {
    await db.query(
      `insert into events (client_id, type, payload) values ($1, 'provisioning_step', $2)`,
      [clientId, { step: 'provision_number', error: err.message, method: err.method }]
    );
  }
  throw err; // let the onboarding run record the failure and checkpoint
}
```

---

## MockVoiceProvider — testing and failure simulation

### State inspection

```js
const mock = new MockVoiceProvider();
await mock.createSubAccount(clientConfig);

// Inspect full account state:
const acct = mock._accounts.get(`mock_acct_${clientConfig.clientId}`);
console.log(acct.phoneNumber);     // null until provisionNumber is called
console.log(acct.contentPack);     // null until applyContentPack is called
console.log(acct.config);          // live config object
console.log(acct.testCalls);       // array of test call records
console.log(acct.deprovisioned);   // true after deprovision

// Inspect full call log:
mock.calls.forEach(({ method, result, error, at }) => console.log(method, result ?? error));
```

### Deterministic values

Generated IDs and numbers are stable across runs — tests can assert exact values:

```js
const { derivePhoneNumber } = require('./voice-provider/src/mock.provider');

const accountId   = `mock_acct_${clientConfig.clientId}`;   // always this formula
const phoneNumber = derivePhoneNumber(accountId, { areaCode: '512' }); // pure function
```

### Simulating failures

```js
// Make provisionNumber always throw (until cleared):
mock.failOn.add('provisionNumber');

// Test your error handler and DB event write:
await assert.rejects(() => mock.provisionNumber(accountId, req), VoiceProviderError);

// Simulate recovery — clear the flag, retry succeeds:
mock.failOn.delete('provisionNumber');
const result = await mock.provisionNumber(accountId, req); // now succeeds
```

### Via env var (no code changes — useful for integration tests)

```bash
MOCK_FAIL_METHODS=provisionNumber,applyContentPack npm run your-integration-test
```

---

## Adding a new provider

1. Create `src/<name>.provider.js` implementing all six methods of `VoiceProvider`.
2. Add a `case '<name>':` branch in `src/index.js`.
3. Add env vars to `.env.example`.
4. Zero changes anywhere else.

---

## Trillet API Due Diligence Checklist

Complete this checklist against Trillet's live API documentation **before** implementing
`TrilletVoiceProvider`. Each item maps to a `TODO` comment in `src/trillet.provider.js`.

| # | Capability | What to verify | Used by |
|---|-----------|----------------|---------|
| 1 | **Sub-account creation** | Is there a POST endpoint to programmatically create an agency sub-account (without dashboard)? What fields are required? What identifier does it return? | `createSubAccount` |
| 2 | **Phone number provisioning** | Can a DID be purchased and assigned to a sub-account via API? Is area-code preference honoured or best-effort? Is the response synchronous? | `provisionNumber` |
| 3 | **Agent configuration** | Is there an API to create an agent on a sub-account with: systemPrompt, greeting, tone, businessHours, forwardToNumber, doNotSay list, escalationKeywords, afterHoursBehavior? | `applyContentPack` |
| 4 | **Content pack push (atomic replace)** | Can a full agent config be replaced atomically via API? Is it PUT (replace) or PATCH (merge)? Is re-applying idempotent — no stacking of prompts? | `applyContentPack` |
| 5 | **Live config update** | Can forwardToNumber, hours, doNotSay, escalationKeywords, tone, and afterHoursBehavior be updated on a running agent without releasing/reprovisioning the number? Is the update propagated immediately or with a delay? | `updateConfig` |
| 6 | **Test call trigger** | Is there an API to initiate an outbound test call from a sub-account's agent to a number we specify? Is the result synchronous, or does it require polling/webhook? Does Trillet charge per test call? | `runTestCall` |
| 7 | **Deprovisioning** | Can a number be released and a sub-account deleted via API? Is it one step or two? Does Trillet stop billing immediately? Is DELETE on an already-deleted resource a 404 or 2xx? | `deprovision` |
| 8 | **Webhook / event push** | Does Trillet push call data (transcript, caller info, duration, emergency flag) to a webhook URL we register? Or must we poll? What events are available? | Monitoring, captured_leads |
| 9 | **Authentication model** | Platform-level API key, per-sub-account key, or OAuth? What is the key rotation procedure? Are there scopes/permissions to request? | All methods |
| 10 | **Rate limits & provisioning latency** | What are the API rate limits? How long does number provisioning take (seconds / minutes)? Any SLAs? Does this affect the onboarding pipeline's step timing or require async handling? | All methods |

**Rule:** do not start implementing any `TrilletVoiceProvider` method until its
checklist item is verified and the expected API shape is confirmed. The stub throws
a `VoiceProviderError` with a clear message pointing here — that is intentional.
