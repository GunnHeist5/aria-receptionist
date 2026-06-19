'use strict';

/**
 * Progressive probe of BYON endpoint — discovers required credential fields
 * by reading each successive validation error.
 * Safe: no real credentials, no number registered.
 *
 * Run: node --env-file=/var/www/aria/.env scripts/trillet-byon-probe2.js
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
  return { status: res.status, msg: json?.message || json?.error || JSON.stringify(json).slice(0, 200) };
}

async function probe(label, body) {
  const r = await req(body);
  console.log(`[${r.status}] ${label}`);
  console.log(`        → ${r.msg}\n`);
}

async function main() {
  // Step 1: just credentials with appendPlus
  await probe('credentials: { appendPlus: true }', {
    credentials: { appendPlus: true },
  });

  // Step 2: Telnyx-style credentials
  await probe('credentials: Telnyx shape (apiKey + appendPlus)', {
    phoneNumber: '+12155550000',
    credentials: { appendPlus: true, provider: 'telnyx', apiKey: 'KEY_FAKE' },
  });

  // Step 3: Twilio-style credentials
  await probe('credentials: Twilio shape (accountSid + authToken + appendPlus)', {
    phoneNumber: '+12155550000',
    credentials: { appendPlus: true, provider: 'twilio', accountSid: 'AC_FAKE', authToken: 'FAKE' },
  });

  // Step 4: what the Trillet number object showed in externalCredentials
  await probe('credentials: full Telnyx connectionId shape', {
    phoneNumber: '+12155550000',
    credentials: {
      appendPlus: true,
      provider: 'telnyx',
      connectionId: 'FAKE_CONNECTION_ID',
      connectionName: 'test',
      username: 'testuser',
      password: 'testpass',
      sipUri: 'sip:test.sip.livekit.cloud',
      domain: 'test.sip.livekit.cloud',
    },
  });

  // Step 5: minimal with just appendPlus + phoneNumber
  await probe('minimal: phoneNumber + credentials.appendPlus only', {
    phoneNumber: '+12155550000',
    credentials: { appendPlus: true },
  });

  // Step 6: try country/type fields too
  await probe('with country + type', {
    phoneNumber: '+12155550000',
    country: 'US',
    type: 'local',
    credentials: { appendPlus: true },
  });
}

main().catch(err => { console.error(err.message); process.exit(1); });
