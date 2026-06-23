'use strict';
// Inspect a contractor's PandaDoc document: recipients + which recipient each
// signature field is assigned to. Reveals why signing is/ isn't possible.
//   node --env-file=.env scripts/inspect-contract.js <contractor_id>

const { Pool } = require('pg');

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: node --env-file=.env scripts/inspect-contract.js <contractor_id>'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [c] } = await pool.query(`SELECT name, contract_document_id FROM contractors WHERE id=$1`, [id]);
  if (!c) { console.error('Contractor not found'); await pool.end(); return; }
  if (!c.contract_document_id) { console.log('No document on file for this contractor.'); await pool.end(); return; }

  const apiKey = (process.env.PANDADOC_API_KEY || '').trim();
  const r = await fetch(`https://api.pandadoc.com/public/v1/documents/${c.contract_document_id}/details`,
    { headers: { Authorization: `API-Key ${apiKey}` } });
  const d = await r.json();

  console.log('Document:', c.contract_document_id, '| status:', d.status, '\n');

  console.log('RECIPIENTS:');
  (d.recipients || []).forEach(rec =>
    console.log(`  ${rec.email}  | role: ${rec.role ?? '(none)'}  | has_completed: ${rec.has_completed}`));

  console.log('\nSIGNATURE / DATE FIELDS:');
  const fields = d.fields || [];
  if (!fields.length) console.log('  (no fields returned)');
  fields.forEach(f => {
    const a = f.assigned_to;
    const who = a ? (a.email || a.role || a.recipient_id || JSON.stringify(a)) : '❌ NOBODY';
    console.log(`  type: ${String(f.type).padEnd(12)} assigned_to: ${who}`);
  });

  console.log('\n── read ──');
  const sigFields = fields.filter(f => f.type === 'signature');
  const unassigned = sigFields.filter(f => !f.assigned_to);
  if (!sigFields.length) console.log('No signature fields on the document — the template has no signable field placed.');
  else if (unassigned.length) console.log(`${unassigned.length} signature field(s) assigned to NOBODY — those can never be signed (template fix needed).`);
  else console.log('All signature fields are assigned to a recipient. Each recipient signs their own field from their own link.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
