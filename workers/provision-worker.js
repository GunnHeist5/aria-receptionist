'use strict';

/**
 * provision-worker.js — polls for status='won' clients and runs the onboarding pipeline.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  COST WARNING                                                        │
 * │  When VOICE_PROVIDER=trillet, each provisioning cycle will:              │
 * │    • Purchase a Twilio phone number via Trillet  (~$1/month per client) │
 * │    • Place a test call if TEST_CALL_NUMBER is set  (per-minute cost)    │
 * │  Run with VOICE_PROVIDER=mock to test safely without spending money.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node workers/provision-worker.js           continuous polling (default 30s)
 *   node workers/provision-worker.js --once    process one client then exit
 *
 * Required env vars (loaded from voice-provider/.env + ai-receptionist-db/.env):
 *   DATABASE_URL      Neon connection string
 *   VOICE_PROVIDER    mock | trillet  (default: mock — see cost warning above)
 *
 * Optional:
 *   POLL_INTERVAL_MS  milliseconds between polls (default 30000)
 *   TEST_CALL_NUMBER  E.164 number to call during test step (skipped if unset)
 */

const path   = require('path');
const dotenv = require(path.join(__dirname, '../voice-provider/node_modules/dotenv'));

// Load env in priority order: root .env > worker overrides > voice-provider creds > db URL
// On the VPS a single /var/www/aria/.env holds all secrets.
// Locally each sub-package has its own .env — all four are checked so neither breaks.
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../voice-provider/.env') });
dotenv.config({ path: path.join(__dirname, '../ai-receptionist-db/.env') });

if (!process.env.DATABASE_URL) {
  console.error('[worker] FATAL: DATABASE_URL not set');
  process.exit(1);
}

const { Pool }             = require('../ai-receptionist-db/node_modules/pg');
const { runOnboarding }   = require('../onboarding/src/index');
const { createVoiceProvider } = require('../voice-provider/src/index');

const POLL_MS  = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);
const RUN_ONCE = process.argv.includes('--once');

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Atomically claim one 'won' client by advancing it to 'provisioning'.
 * FOR UPDATE SKIP LOCKED prevents concurrent workers from double-claiming.
 */
async function claimClient(pool) {
  const { rows } = await pool.query(`
    UPDATE clients
    SET    status = 'provisioning', updated_at = NOW()
    WHERE  id = (
      SELECT id FROM clients
      WHERE  status = 'won'
        AND  billing_status = 'active'
      ORDER  BY created_at ASC
      LIMIT  1
      FOR    UPDATE SKIP LOCKED
    )
    RETURNING id, business_name
  `);
  return rows[0] || null;
}

/**
 * On pipeline failure, reset the client to 'won' so the next poll cycle
 * will pick it up and resume from the stored checkpoint.
 */
async function releaseClient(pool, clientId) {
  await pool.query(
    `UPDATE clients SET status = 'won', updated_at = NOW() WHERE id = $1`,
    [clientId]
  );
}

// ---------------------------------------------------------------------------
// Owner notification — fires after each successful provisioning
// ---------------------------------------------------------------------------

async function notifyOwnerClientLive(pool, clientId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !owner) return;

  const { rows: [c] } = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
  if (!c) return;

  const number = c.provisioned_number ?? '(number not found)';
  const msg =
    `✅ <b>Client Live: ${c.business_name}</b>\n` +
    `📞 AI number: <code>${number}</code>\n` +
    `📍 ${c.city}, ${c.state}\n` +
    `↪️ Forwards to: ${c.forward_to_number}\n\n` +
    `<b>Send this to the client:</b>\n` +
    `<i>Hi! Your AI receptionist is live. Your new number is ${number}. ` +
    `Set it as your call-forward-on-no-answer so any call you miss goes straight to the AI. ` +
    `Call it yourself now to hear how it sounds!</i>`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: owner, text: msg, parse_mode: 'HTML' }),
  });
}

// ---------------------------------------------------------------------------
// One polling cycle
// ---------------------------------------------------------------------------

async function runCycle(pool, provider) {
  const client = await claimClient(pool);
  if (!client) {
    process.stdout.write('[worker] poll — no pending clients\n');
    return;
  }

  const tag = `${client.business_name} (${client.id})`;
  process.stdout.write(`[worker] claimed  ${tag}\n`);

  try {
    const { runId } = await runOnboarding(client.id, { db: pool, provider });
    process.stdout.write(`[worker] ✓ live   ${tag}  run=${runId}\n`);
    await notifyOwnerClientLive(pool, client.id).catch(e =>
      process.stderr.write(`[worker] notify failed: ${e.message}\n`)
    );
  } catch (err) {
    process.stdout.write(`[worker] ✗ failed ${tag}: ${err.message}\n`);
    // Reset to 'won' so the next cycle retries from the pipeline checkpoint
    await releaseClient(pool, client.id);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const voiceEnv = process.env.VOICE_PROVIDER ?? 'mock';

  if (voiceEnv === 'trillet') {
    process.stdout.write(
      '[worker] ⚠️  LIVE MODE (VOICE_PROVIDER=trillet)\n' +
      '[worker]    Phone numbers will be purchased from Trillet/Twilio.\n' +
      '[worker]    Each client costs ~$1/month. Ensure this is intentional.\n'
    );
  } else {
    process.stdout.write(`[worker] SAFE MODE (VOICE_PROVIDER=${voiceEnv}) — no real calls or purchases\n`);
  }

  const pool     = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  const provider = createVoiceProvider();

  process.stdout.write(`[worker] ready  VOICE_PROVIDER=${voiceEnv}  poll=${POLL_MS}ms\n`);

  // Graceful shutdown
  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      if (stopping) return;
      stopping = true;
      process.stdout.write('\n[worker] shutting down…\n');
      await pool.end();
      process.exit(0);
    });
  }

  if (RUN_ONCE) {
    await runCycle(pool, provider);
    await pool.end();
    return;
  }

  while (!stopping) {
    try {
      await runCycle(pool, provider);
    } catch (err) {
      process.stderr.write(`[worker] cycle error: ${err.message}\n`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(err => {
  process.stderr.write(`[worker] fatal: ${err.message}\n`);
  process.exit(1);
});
