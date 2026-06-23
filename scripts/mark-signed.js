'use strict';
// Manually mark a contractor's contract as signed (when the PandaDoc webhook
// didn't record it). Sets the same fields the webhook would, idempotently.
//
//   node --env-file=.env scripts/mark-signed.js <contractor_id>
//
// If the rep has already connected Telegram (channel_id set), the onboarding
// burst is sent by the Telegram /start handler when they tap their deep link.
// This script does NOT send the burst itself (that lives in TS); it only
// records the signature and prints the deep link to forward.

const { Pool } = require('pg');

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: node --env-file=.env scripts/mark-signed.js <contractor_id>'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Sets signed AND owner-approved in one shot (manual fallback = you've already
  // decided to onboard them). When the rep taps their deep link, the /start
  // handler sees 'onboarding_approved' and fires the burst.
  const { rows: [r] } = await pool.query(
    `UPDATE contractors SET
       contract_signed_at = NOW(),
       onboarding_status  = 'onboarding_approved',
       updated_at         = NOW()
     WHERE id = $1 AND contract_signed_at IS NULL
     RETURNING name, slug, channel_id`,
    [id]
  );

  if (!r) {
    const { rows: [c] } = await pool.query(
      `SELECT name, contract_signed_at, channel_id FROM contractors WHERE id = $1`, [id]
    );
    console.log(c ? `Already signed (or no change): ${c.name}, signed_at=${c.contract_signed_at}, channel_id=${c.channel_id}` : 'Contractor not found');
    await pool.end();
    return;
  }

  console.log(`✓ Marked signed: ${r.name} (slug: ${r.slug})`);
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (r.channel_id) {
    console.log('Telegram already connected — onboarding will fire on next /start, or restart aria-web has no effect.');
    console.log('If he already tapped the link before signing, have him send /start again.');
  } else {
    console.log(`\n📱 Forward this link so he connects Telegram and gets onboarded:\nhttps://t.me/${bot}?start=ctr_${id}`);
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
