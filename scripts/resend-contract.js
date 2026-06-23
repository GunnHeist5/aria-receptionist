'use strict';
// Resend a fresh contractor agreement and produce a DIRECT signing link you can
// paste straight to the rep (no inbox digging). Also emails it as a backup.
//   node --env-file=.env scripts/resend-contract.js <contractor_id>
//
// Resets the rep's signing state so the new contract flows correctly: when they
// sign, the worker's poll detects it and pings you "Approve to onboard?".

const { Pool } = require('pg');

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: node --env-file=.env scripts/resend-contract.js <contractor_id>'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows: [c] } = await pool.query(`SELECT id, name, email FROM contractors WHERE id=$1`, [id]);
  if (!c) { console.error('Contractor not found'); await pool.end(); process.exit(1); }

  const apiKey     = (process.env.PANDADOC_API_KEY || '').trim();
  const templateId = (process.env.PANDADOC_TEMPLATE_ID || '').trim();
  const role       = (process.env.PANDADOC_RECIPIENT_ROLE || 'Client').trim();
  if (!apiKey || !templateId) { console.error('PandaDoc env not configured'); await pool.end(); process.exit(1); }

  const [firstName, ...rest] = c.name.trim().split(' ');
  const lastName = rest.join(' ') || '-';
  const bot = (process.env.TELEGRAM_BOT_USERNAME || '').trim();
  const deepLink = bot ? `\n\nAfter signing, connect on Telegram to get set up:\nhttps://t.me/${bot}?start=ctr_${c.id}` : '';

  // 1. Reset signing state so the fresh contract is the source of truth.
  await pool.query(
    `UPDATE contractors SET contract_signed_at=NULL, onboarding_status='offered', updated_at=NOW() WHERE id=$1`,
    [c.id]
  );

  // 2. Create a fresh document from the template.
  const recipients = [{ email: c.email, first_name: firstName, last_name: lastName, role }];
  const companyRole  = (process.env.PANDADOC_COMPANY_ROLE || '').trim();
  const companyEmail = (process.env.PANDADOC_COMPANY_EMAIL || '').trim();
  if (companyRole && companyEmail) {
    const cn = (process.env.PANDADOC_COMPANY_NAME || 'Reachwell').trim().split(' ');
    recipients.push({ email: companyEmail, first_name: cn[0], last_name: cn.slice(1).join(' ') || '-', role: companyRole });
  }
  const createRes = await fetch('https://api.pandadoc.com/public/v1/documents', {
    method: 'POST', headers: { Authorization: `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Reachwell Contractor Agreement — ${c.name}`,
      template_uuid: templateId,
      recipients,
      metadata: { contractor_id: c.id },
      tokens: [{ name: 'Contractor.Name', value: c.name }, { name: 'Contractor.Email', value: c.email }],
    }),
  });
  const doc = await createRes.json();
  const docId = doc.uuid || doc.id;
  if (!docId) { console.error('Create failed:', JSON.stringify(doc)); await pool.end(); process.exit(1); }
  console.log('✓ Fresh document created:', docId);
  await pool.query(`UPDATE contractors SET contract_document_id=$2 WHERE id=$1`, [c.id, docId]);

  // 3. Send (emails a persistent signing link as backup).
  await new Promise(r => setTimeout(r, 3000));
  const sendRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${docId}/send`, {
    method: 'POST', headers: { Authorization: `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Hi ${firstName}, here's your Reachwell contractor agreement to review and sign.${deepLink}`, silent: false }),
  });
  const sent = await sendRes.json();
  console.log('✓ Email sent to', c.email, '— status:', JSON.stringify(sent.status || sent));

  // 4. Generate a direct signing-session link to paste to the rep.
  await new Promise(r => setTimeout(r, 2500));
  try {
    const sessRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${docId}/session`, {
      method: 'POST', headers: { Authorization: `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: c.email, lifetime: 86400 }),
    });
    const sess = await sessRes.json();
    if (sess.id) {
      console.log('\n📄 DIRECT SIGNING LINK — paste this to the rep:');
      console.log(`   https://app.pandadoc.com/s/${sess.id}`);
      console.log('   (works for ~24h; the emailed link does not expire as a backup)');
    } else {
      console.log('\nDirect link unavailable:', JSON.stringify(sess));
      console.log('The rep can sign from the email just sent.');
    }
  } catch (e) {
    console.log('\nDirect link error:', e.message, '— the rep can sign from the email just sent.');
  }

  console.log(`\nWhen ${firstName} signs, you'll get the Telegram "Approve to onboard?" prompt automatically.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
