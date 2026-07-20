'use strict';
// Step-1 investigation: list JustCall users/seats with their agent_id + email,
// and show the EXACT response field names (needed to map JustCall agents →
// contractors and to build the call-log sync against real shapes, not guesses).
//   node --env-file=.env scripts/justcall-users-probe.js

const jc = require('../lib/justcall');

async function main() {
  const res = await jc.jc('GET', '/v2.1/users', { query: { per_page: 100 } });
  const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : null;
  if (!rows) {
    console.log('Unexpected shape — top-level keys:', Object.keys(res));
    console.log(JSON.stringify(res, null, 2).slice(0, 1500));
    return;
  }
  console.log(`Users on the account: ${rows.length}\n`);
  for (const u of rows) {
    const name = u.name ?? ([u.first_name, u.last_name].filter(Boolean).join(' ') || '?');
    console.log(`  id=${u.agent_id ?? u.id} | ${u.email ?? '?'} | ${name} | role=${u.role ?? '?'}`);
  }
  console.log('\nField names on a user object:', Object.keys(rows[0] ?? {}).join(', '));
}

main().catch(e => { console.error('Probe failed:', e.message); process.exit(1); });
