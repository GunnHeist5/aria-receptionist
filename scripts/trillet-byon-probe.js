'use strict';

/**
 * Probes the BYON register-external-number endpoint to discover required fields.
 * Sends intentionally bad/empty requests to read validation error messages.
 * No money spent, no number registered.
 *
 * Run: node --env-file=/var/www/aria/.env scripts/trillet-byon-probe.js
 */

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) { console.error('Missing env vars'); process.exit(1); }

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'x-api-key': KEY, 'x-workspace-id': WID,
      'Accept': 'application/json', 'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function main() {
  console.log('=== Probing BYON endpoint with empty body ===');
  const r1 = await req('POST', '/twilio/register-external-number', {});
  console.log(`Status: ${r1.status}`);
  console.log('Response:', JSON.stringify(r1.body, null, 2));

  console.log('\n=== Probing with Twilio-style fields ===');
  const r2 = await req('POST', '/twilio/register-external-number', {
    phoneNumber: '+12155550000',
    accountSid: 'AC_test',
    authToken: 'test',
  });
  console.log(`Status: ${r2.status}`);
  console.log('Response:', JSON.stringify(r2.body, null, 2));

  console.log('\n=== Probing with Telnyx-style fields ===');
  const r3 = await req('POST', '/twilio/register-external-number', {
    phoneNumber: '+12155550000',
    apiKey: 'test_key',
    connectionId: 'test_connection',
  });
  console.log(`Status: ${r3.status}`);
  console.log('Response:', JSON.stringify(r3.body, null, 2));

  console.log('\n=== Checking if endpoint exists at all ===');
  const endpoints = [
    '/twilio/register-external-number',
    '/twilio/byon',
    '/twilio/bring-your-own-number',
    '/phone-numbers/register',
  ];
  for (const ep of endpoints) {
    const r = await req('POST', ep, {});
    console.log(`POST ${ep} → ${r.status}: ${r.body?.error || r.body?.message || JSON.stringify(r.body).slice(0,80)}`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
