'use strict';

/**
 * BYON probe round 3 — uses correct field names from error message.
 * Run: node --env-file=/var/www/aria/.env scripts/trillet-byon-probe3.js
 */

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) { console.error('Missing env vars'); process.exit(1); }

async function req(body) {
  const res = await fetch(`${BASE}/twilio/register-external-number`, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, msg: json?.message || json?.error || JSON.stringify(json).slice(0, 300) };
}

async function probe(label, body) {
  const r = await req(body);
  console.log(`[${r.status}] ${label}`);
  console.log(`        → ${r.msg}\n`);
}

async function main() {
  // The error said: "Phone number, provider type, and workspace ID are required"
  // So field names are likely: phoneNumber/number, providerType, workspaceId (in body)

  await probe('providerType + workspaceId in body (Telnyx)', {
    phoneNumber: '+12155550000',
    providerType: 'telnyx',
    workspaceId: WID,
    credentials: { appendPlus: true },
  });

  await probe('providerType + workspaceId in body (Twilio)', {
    phoneNumber: '+12155550000',
    providerType: 'twilio',
    workspaceId: WID,
    credentials: { appendPlus: true },
  });

  await probe('number field instead of phoneNumber', {
    number: '+12155550000',
    providerType: 'telnyx',
    workspaceId: WID,
    credentials: { appendPlus: true },
  });

  await probe('providerType telnyx + apiKey in credentials', {
    phoneNumber: '+12155550000',
    providerType: 'telnyx',
    workspaceId: WID,
    credentials: { appendPlus: true, apiKey: 'KEY_FAKE_TEST' },
  });

  await probe('providerType twilio + accountSid/authToken', {
    phoneNumber: '+12155550000',
    providerType: 'twilio',
    workspaceId: WID,
    credentials: {
      appendPlus: false,
      accountSid: 'AC_FAKE_TEST_ONLY',
      authToken:  'FAKE_TOKEN_TEST',
    },
  });
}

main().catch(err => { console.error(err.message); process.exit(1); });
