'use strict';
// Manually (re)send a PandaDoc contract to an existing contractor.
// Usage: node --env-file=.env scripts/send-contract.js <contractor_id>
//
// Reads name/email from the contractors table. Role comes from
// PANDADOC_RECIPIENT_ROLE (default 'Client'). Trims keys so a stray
// leading/trailing space in .env can't break auth.

const { Pool } = require('pg');

async function main() {
  const contractorId = process.argv[2];
  if (!contractorId) {
    console.error('Usage: node --env-file=.env scripts/send-contract.js <contractor_id>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [c] } = await pool.query(
    `SELECT id, name, email FROM contractors WHERE id = $1`, [contractorId]
  );
  if (!c) { console.error('No contractor with id', contractorId); await pool.end(); process.exit(1); }

  const apiKey     = (process.env.PANDADOC_API_KEY     || '').trim();
  const templateId = (process.env.PANDADOC_TEMPLATE_ID || '').trim();
  const role       = (process.env.PANDADOC_RECIPIENT_ROLE || 'Client').trim();
  if (!apiKey || !templateId) { console.error('PANDADOC_API_KEY / PANDADOC_TEMPLATE_ID missing'); await pool.end(); process.exit(1); }

  const [firstName, ...rest] = c.name.trim().split(' ');
  const lastName = rest.join(' ') || '-';

  const createRes = await fetch('https://api.pandadoc.com/public/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Reachwell Contractor Agreement — ${c.name}`,
      template_uuid: templateId,
      recipients: [{ email: c.email, first_name: firstName, last_name: lastName, role }],
      metadata: { contractor_id: c.id },
      tokens: [
        { name: 'Contractor.Name',  value: c.name },
        { name: 'Contractor.Email', value: c.email },
      ],
    }),
  });

  const doc   = await createRes.json();
  const docId = doc.uuid || doc.id;
  if (!docId) { console.error('Create failed:', JSON.stringify(doc)); await pool.end(); process.exit(1); }
  console.log('Doc created:', docId);

  await new Promise(r => setTimeout(r, 2500));

  const sendRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${docId}/send`, {
    method: 'POST',
    headers: { 'Authorization': `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Hi ${firstName}, please sign your Reachwell contractor agreement to get started.`,
      silent: false,
    }),
  });

  const sent = await sendRes.json();
  console.log('Send status:', JSON.stringify(sent.status || sent));
  console.log(`\nContract sent to ${c.email}.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
