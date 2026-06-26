'use strict';
// The /calls/{id}/ai path 404'd ("Cannot GET" = wrong route). JustCall's docs
// disagree on the AI-data path, so probe the candidates against the LIVE API and
// see which one is a real route. A real route returns 200, or a *structured*
// error (JSON message) rather than the Express "Cannot GET …" route-not-found.
//   node --env-file=.env scripts/justcall-ai-path-probe.js [callId]

const jc = require('../lib/justcall');

const CANDIDATES = [
  '/v2.1/calls/{id}/ai',
  '/v2.1/calls_ai/{id}',
  '/v2.1/calls/ai/{id}',
  '/v2.1/calls/{id}/ai-data',
  '/v2.1/calls/{id}/transcription',
];

async function main() {
  const id = process.argv[2] || '388643651';
  console.log('Probing AI-data endpoint candidates for call', id, '\n');
  for (const tmpl of CANDIDATES) {
    const path = tmpl.replace('{id}', id);
    try {
      const res = await jc.jc('GET', path, { query: { fetch_transcription: true, fetch_summary: true } });
      console.log(`✓ 200  ${path}\n       keys: ${Object.keys(res).join(', ')}`);
    } catch (e) {
      const wrongRoute = /Cannot GET/i.test(e.message);
      console.log(`${wrongRoute ? '✗ route-not-found' : '○ real route, error '} ${path}\n       ${e.message.slice(0, 140)}`);
    }
  }
  console.log('\nThe path that returns 200 — or a structured error (NOT "Cannot GET") — is the real one.');
  console.log('Tell me which, and I\'ll point lib/justcall.js getCallAi() at it.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
