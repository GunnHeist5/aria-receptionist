'use strict';
// One-shot script to manually approve a candidate when the Telegram button is gone.
// Usage: node --env-file=.env scripts/approve-candidate.js
//
// Edit CANDIDATE_ID, NAME, EMAIL below before running.

const { Pool } = require('pg');

const CANDIDATE_ID = 'b925504c-0e53-4008-9bd9-a28df62ed38f';
const NAME         = 'MJ George Lariosa';
const EMAIL        = 'lariosamjgeorge00@gmail.com';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Mark candidate as offered
  await pool.query(`UPDATE candidates SET status='offered' WHERE id=$1`, [CANDIDATE_ID]);
  console.log('✓ Candidate marked offered');

  // 2. Generate slug
  const baseSlug = NAME.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  const { rows: [slugCheck] } = await pool.query(
    `SELECT COUNT(*) AS n FROM contractors WHERE slug LIKE $1`, [`${baseSlug}%`]
  );
  const slug = Number(slugCheck.n) > 0 ? `${baseSlug}${Number(slugCheck.n) + 1}` : baseSlug;

  // 3. Create contractor record
  const { rows: [contractor] } = await pool.query(
    `INSERT INTO contractors (name, email, slug, commission_setup, commission_residual_pct)
     VALUES ($1, $2, $3, 400, 10) RETURNING id`,
    [NAME, EMAIL, slug]
  );
  console.log(`✓ Contractor created — id: ${contractor.id}  slug: ${slug}`);

  // 4. Send PandaDoc contract
  const apiKey     = process.env.PANDADOC_API_KEY;
  const templateId = process.env.PANDADOC_TEMPLATE_ID;
  const role       = process.env.PANDADOC_RECIPIENT_ROLE ?? 'Contractor';

  if (!apiKey || !templateId) {
    console.warn('⚠️  PandaDoc not configured — send contract manually to', EMAIL);
  } else {
    const [firstName, ...rest] = NAME.trim().split(' ');
    const lastName = rest.join(' ') || '-';

    const createRes = await fetch('https://api.pandadoc.com/public/v1/documents', {
      method: 'POST',
      headers: { 'Authorization': `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Reachwell Contractor Agreement — ${NAME}`,
        template_uuid: templateId,
        recipients: [{ email: EMAIL, first_name: firstName, last_name: lastName, role }],
        metadata: { contractor_id: contractor.id },
        tokens: [
          { name: 'Contractor.Name',  value: NAME },
          { name: 'Contractor.Email', value: EMAIL },
        ],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('✗ PandaDoc create failed:', err.slice(0, 300));
    } else {
      const doc   = await createRes.json();
      const docId = doc.uuid ?? doc.id;
      console.log('✓ PandaDoc document created:', docId);

      await new Promise(r => setTimeout(r, 2000));

      const sendRes = await fetch(`https://api.pandadoc.com/public/v1/documents/${docId}/send`, {
        method: 'POST',
        headers: { 'Authorization': `API-Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Hi ${firstName}, please sign your Reachwell contractor agreement to get started.`,
          silent: false,
        }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error('✗ PandaDoc send failed:', err.slice(0, 300));
      } else {
        console.log('✓ Contract sent to', EMAIL);
      }
    }
  }

  // 5. Print Telegram deep link
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (botUsername) {
    console.log(`\n📱 Forward this link to ${NAME} so they connect Telegram:\nhttps://t.me/${botUsername}?start=ctr_${contractor.id}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
