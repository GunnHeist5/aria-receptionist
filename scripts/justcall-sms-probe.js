'use strict';

/**
 * SMS-send verification gate for the no-answer follow-up loop.
 * Sends ONE test text to a number YOU own, trying the candidate endpoints,
 * and prints exactly which endpoint + body shape worked (plus the response,
 * which should show cost/segment info if JustCall returns it).
 *
 * Run on the VPS (never against a lead — use your own cell):
 *   node --env-file=.env scripts/justcall-sms-probe.js +1YOURCELL
 *
 * List your JustCall numbers first (to pick the sender) with:
 *   node --env-file=.env scripts/justcall-sms-probe.js --numbers
 *
 * Once a candidate succeeds, set JUSTCALL_SMS_FROM in .env to the sender
 * number and lib/justcall.js sendText() is ready (it uses the same #1 shape).
 */

const jc = require('../lib/justcall');

async function listNumbers() {
  for (const path of ['/v2.1/phone-numbers', '/v2.1/numbers']) {
    try {
      const res = await jc.jc('GET', path, { query: { per_page: 50 } });
      const rows = res.data ?? res;
      console.log(`✓ ${path}\n`);
      (Array.isArray(rows) ? rows : []).forEach(n =>
        console.log(' ', n.justcall_number ?? n.phone_number ?? n.number ?? JSON.stringify(n).slice(0, 120),
                    '—', n.friendly_name ?? n.name ?? ''));
      return;
    } catch (e) {
      console.log(`✗ ${path}: ${e.message.slice(0, 120)}`);
    }
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/justcall-sms-probe.js +1YOURCELL   (or --numbers to list senders)');
    process.exit(1);
  }
  if (arg === '--numbers') return listNumbers();

  const to   = arg.trim();
  const from = (process.env.JUSTCALL_SMS_FROM || '').trim();
  if (!from) {
    console.error('Set JUSTCALL_SMS_FROM in .env first (one of your JustCall numbers).');
    console.error('Find them with: node --env-file=.env scripts/justcall-sms-probe.js --numbers');
    process.exit(1);
  }
  if (!/^\+?1?\d{10}$/.test(to.replace(/[\s().-]/g, ''))) {
    console.error(`"${to}" doesn't look like a US number — this probe only texts YOUR OWN phone.`);
    process.exit(1);
  }

  const body = 'Reachwell SMS probe — if you got this, the JustCall SMS API works. (test message)';

  // Candidate endpoint + body shapes, most-likely first (per JustCall v2.1 docs).
  const candidates = [
    { path: '/v2.1/texts/new', body: { justcall_number: from, contact_number: to, body } },
    { path: '/v2.1/texts',     body: { justcall_number: from, contact_number: to, body } },
    { path: '/v2.1/texts/new', body: { from, to, body } },
  ];

  for (const c of candidates) {
    try {
      console.log(`Trying POST ${c.path} with keys [${Object.keys(c.body).join(', ')}]...`);
      const res = await jc.jc('POST', c.path, { body: c.body });
      console.log(`\n✓ SUCCESS via POST ${c.path}`);
      console.log('Response:', JSON.stringify(res, null, 2).slice(0, 1500));
      console.log('\nCheck your phone for the text. This is the shape sendText() uses —');
      console.log('if a different candidate than #1 won, tell Claude so lib/justcall.js gets locked to it.');
      return;
    } catch (e) {
      console.log(`  ✗ ${e.message.slice(0, 160)}\n`);
    }
  }
  console.error('All candidates failed. Paste this output to Claude to adjust the endpoint.');
  process.exit(1);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
