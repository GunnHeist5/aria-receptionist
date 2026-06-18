# onboarding

Onboarding pipeline — takes a client from `status='won'` to `status='live'`
in five resumable steps, writing DB checkpoints at each one.

---

## Steps

| # | Key                  | What it does                                      | DB writes                                         |
|---|----------------------|---------------------------------------------------|---------------------------------------------------|
| 1 | `create_account`     | Creates a voice-provider sub-account              | `voice_provider`, `voice_provider_account_id`     |
| 2 | `provision_number`   | Buys and assigns a phone number                   | `provisioned_number`                              |
| 3 | `apply_content_pack` | Pushes prompt + config to the agent               | `content_pack_version`                            |
| 4 | `run_test_call`      | Verifies the agent answers (skips if no test #)   | _(none — diagnostic only)_                        |
| 5 | `activate`           | Sets `status='live'`, marks `billing_status='pending'` | `status`, `activated_at`, `billing_status`   |

All steps also write a `provisioning_step` event to the `events` table.
Failed steps write a `provisioning_step` event with `status: 'failed'` —
**never** `payment_failed`, which is reserved for Stripe/billing concerns.

---

## Setup

```bash
cd onboarding
cp .env.example .env
npm install
```

| Env var            | Required | Purpose                                               |
|--------------------|----------|-------------------------------------------------------|
| `VOICE_PROVIDER`   | No       | `mock` (default) or `trillet`                         |
| `TEST_CALL_NUMBER` | No       | E.164 number to receive test calls in step 4. If unset, step 4 skips gracefully. |

---

## Running tests

```bash
npm test
```

Tests run entirely in-memory — no database, no voice provider, no network.
A `MemDb` class (in `__tests__/pipeline.test.js`) implements the same
`query(sql, params)` interface as a `pg.Pool`, matching the exact SQL patterns
the pipeline emits.

---

## Usage (from orchestrator / Jarvis)

```js
const { runOnboarding } = require('./onboarding/src');
const { getPool }        = require('./ai-receptionist-db/scripts/db');

const db = getPool(); // pg.Pool pointed at Neon

// Onboard a single client (provider auto-selected from VOICE_PROVIDER env):
await runOnboarding(clientId, { db });

// Or inject a specific provider (e.g. in tests):
const mock = new MockVoiceProvider();
await runOnboarding(clientId, { db, provider: mock });
```

### Resumability

If the pipeline fails mid-run, calling `runOnboarding` again with the same
`clientId` will:
1. Find the existing `onboarding_runs` row (status `'failed'`).
2. Reset it to `'running'`.
3. Skip every step already in `steps_completed`.
4. Resume from the first incomplete step.

The orchestrator can retry unconditionally — the pipeline is idempotent once
the sub-account exists.

---

## Content packs

Packs live in `src/content-packs/`. Each is a pure function:

```js
// (client: ClientRow) → ContentPack
function buildPlumbingV1(client) { ... }
```

The step `03-apply-content-pack.js` selects a builder via `PACK_BUILDERS`,
keyed by `client.business_type`. To add a new vertical:

1. Create `src/content-packs/<vertical>-v1.js`
2. Add an entry to `PACK_BUILDERS` in `src/steps/03-apply-content-pack.js`

---

## Billing integration decision

> **Status: open — resolve when Stripe is wired in.**

Step 5 (`activate`) currently sets `status='live'` immediately, then marks
`billing_status='pending'` for the billing component to pick up.

Three options for the final order of operations:

**A) Activate now, bill after** _(current)_
- Client goes live instantly.
- Risk: we eat Trillet usage costs if Stripe setup fails post-live.

**B) Confirm Stripe subscription, then activate**
- Zero usage cost without confirmed payment.
- Risk: activation latency tied to Stripe API; worse client UX.

**C) Activate + charge concurrently; deprovision within grace window if payment fails**
- Fast activation + payment safety net.
- Requires a grace-period cron job.

This is a conscious deferral — see the comment block in `src/steps/05-activate.js`.
