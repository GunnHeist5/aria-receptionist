'use strict';
// Diagnose a contractor's onboarding state: DB columns, contractor row,
// and the real PandaDoc document signature status.
//
//   node --env-file=.env scripts/check-onboarding.js <contractor_id> [pandadoc_doc_id]

const { Pool } = require('pg');

async function main() {
  const contractorId = process.argv[2];
  const docId        = process.argv[3];
  if (!contractorId) {
    console.error('Usage: node --env-file=.env scripts/check-onboarding.js <contractor_id> [doc_id]');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Which webhook-required columns actually exist on contractors?
  const { rows: colRows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='contractors'`
  );
  const cols = new Set(colRows.map(r => r.column_name));
  const needed = ['contract_signed_at', 'contract_document_id', 'onboarding_status', 'onboarding_step', 'channel_id'];
  console.log('── contractors columns the PandaDoc webhook writes ──');
  for (const c of needed) console.log(`   ${cols.has(c) ? '✅' : '❌ MISSING'}  ${c}`);

  // 2. Contractor row (only safe columns)
  const { rows: [c] } = await pool.query(
    `SELECT id, name, email, slug, channel_id, contract_signed_at, onboarding_step, active
     FROM contractors WHERE id = $1`, [contractorId]
  );
  console.log('\n── contractor row ──');
  if (!c) { console.log('   NOT FOUND'); }
  else {
    console.log(`   name:               ${c.name}`);
    console.log(`   email:              ${c.email}`);
    console.log(`   slug:               ${c.slug}`);
    console.log(`   channel_id:         ${c.channel_id ?? '(null — Telegram NOT connected)'}`);
    console.log(`   contract_signed_at: ${c.contract_signed_at ?? '(null — not recorded as signed)'}`);
    console.log(`   onboarding_step:    ${c.onboarding_step}`);
    console.log(`   active:             ${c.active}`);
  }

  // 3. Real PandaDoc status
  if (docId) {
    const key = (process.env.PANDADOC_API_KEY || '').trim();
    try {
      const r = await fetch(`https://api.pandadoc.com/public/v1/documents/${docId}/details`,
        { headers: { Authorization: `API-Key ${key}` } });
      const d = await r.json();
      console.log('\n── PandaDoc document ──');
      console.log(`   status:    ${d.status}`);
      if (d.date_completed) console.log(`   completed: ${d.date_completed}`);
      (d.recipients || []).forEach(rec =>
        console.log(`   recipient: ${rec.email} — ${rec.has_completed ? 'SIGNED ✅' : 'not signed'}`));
    } catch (e) {
      console.log('\n── PandaDoc document ── error:', e.message);
    }
  }

  // 4. Verdict
  console.log('\n── verdict ──');
  if (c?.contract_signed_at && c?.channel_id) console.log('   Signed + connected. Onboarding should have fired.');
  else if (c?.contract_signed_at) console.log('   Signed but Telegram not connected → he taps the deep link → burst fires.');
  else console.log('   contract_signed_at NOT set. If PandaDoc shows SIGNED above, the webhook failed to record it — needs manual fix.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
