'use strict';

/**
 * Final BYON probe — snake_case fields + GET list endpoint check.
 * Run: node --env-file=/var/www/aria/.env scripts/trillet-byon-probe4.js
 */

const BASE = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1').replace(/\/$/, '') + '/api';
const KEY  = process.env.TRILLET_API_KEY;
const WID  = process.env.TRILLET_WORKSPACE_ID;

if (!KEY || !WID) { console.error('Missing env vars'); process.exit(1); }

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'x-api-key': KEY, 'x-workspace-id': WID, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, msg: json?.message || json?.error || JSON.stringify(json).slice(0, 300) };
}

async function probe(label, body) {
  const r = await req('POST', '/twilio/register-external-number', body);
  console.log(`[${r.status}] ${label}`);
  console.log(`        → ${r.msg}\n`);
}

async function main() {
  // Try snake_case
  await probe('snake_case fields: phone_number + provider_type + workspace_id', {
    phone_number: '+12155550000',
    provider_type: 'telnyx',
    workspace_id: WID,
    credentials: { appendPlus: true },
  });

  // Try completely flat (no credentials object)
  await probe('flat body, no credentials object', {
    phoneNumber: '+12155550000',
    providerType: 'telnyx',
    workspaceId: WID,
    appendPlus: true,
    apiKey: 'FAKE',
  });

  // Try with sid field (Twilio naming)
  await probe('sid field naming', {
    phoneNumber: '+12155550000',
    type: 'telnyx',
    sid: WID,
    credentials: { appendPlus: true },
  });

  // GET - list registered external numbers
  console.log('=== GET /twilio/external-numbers ===');
  const r1 = await req('GET', '/twilio/external-numbers');
  console.log(`[${r1.status}] → ${r1.msg}\n`);

  console.log('=== GET /twilio/registered-numbers ===');
  const r2 = await req('GET', '/twilio/registered-numbers');
  console.log(`[${r2.status}] → ${r2.msg}\n`);

  console.log('=== Conclusion ===');
  console.log('If all POSTs return the same 400 with different field names,');
  console.log('the endpoint is JWT-gated (same issue as purchase-number).');
  console.log('BYON cannot be automated via API key auth until Trillet fixes it.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
