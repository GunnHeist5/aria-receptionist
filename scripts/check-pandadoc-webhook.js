'use strict';
// Lists PandaDoc webhook subscriptions and flags whether ours is set up right.
//   node --env-file=.env scripts/check-pandadoc-webhook.js
//
// We need a subscription that:
//   • points at https://<base>/api/webhooks/pandadoc
//   • has a shared_key matching PANDADOC_WEBHOOK_SECRET (for HMAC verification)
//   • includes the 'recipient_completed' trigger (rep signing their part)

async function main() {
  const key  = (process.env.PANDADOC_API_KEY || '').trim();
  const base = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const want = `${base}/api/webhooks/pandadoc`;

  const r = await fetch('https://api.pandadoc.com/public/v1/webhook-subscriptions', {
    headers: { Authorization: `API-Key ${key}` },
  });
  if (!r.ok) {
    console.error('Could not list webhook subscriptions:', r.status, (await r.text()).slice(0, 300));
    console.error('\nIf this 404s/403s, the webhook may only be manageable in the PandaDoc dashboard:');
    console.error('  Settings → Integrations → Webhooks');
    process.exit(1);
  }

  const data = await r.json();
  const subs = data.results ?? data ?? [];
  if (!subs.length) { console.log('No webhook subscriptions found. You need to create one (see below).'); }

  console.log(`Looking for endpoint: ${want}\n`);
  let ours = null;
  for (const s of subs) {
    const triggers = s.triggers ?? s.events ?? [];
    console.log(`• ${s.name ?? '(unnamed)'} → ${s.url}`);
    console.log(`    active:   ${s.active}`);
    console.log(`    triggers: ${triggers.join(', ') || '(none)'}`);
    console.log(`    shared_key set: ${s.shared_key ? 'yes' : 'no'}`);
    if (s.url === want || (s.url || '').includes('/api/webhooks/pandadoc')) ours = s;
  }

  console.log('\n── verdict ──');
  if (!ours) {
    console.log('❌ No subscription points at our endpoint. Create one in PandaDoc dashboard:');
    console.log(`   URL: ${want}`);
    console.log('   Trigger: "Recipient completed"  (and optionally "Document state changed")');
    console.log(`   Shared key: ${process.env.PANDADOC_WEBHOOK_SECRET?.trim() || '(set PANDADOC_WEBHOOK_SECRET)'}`);
    return;
  }
  const triggers = ours.triggers ?? ours.events ?? [];
  const hasRecipient = triggers.includes('recipient_completed');
  const hasDocState  = triggers.includes('document_state_changed');
  console.log(`Endpoint found: ${ours.url}`);
  console.log(`  recipient_completed subscribed:    ${hasRecipient ? '✅' : '❌ ADD THIS'}`);
  console.log(`  document_state_changed subscribed: ${hasDocState ? '✅' : '⚠️ optional but recommended'}`);
  console.log(`  shared_key set:                    ${ours.shared_key ? '✅' : '⚠️ set it to match PANDADOC_WEBHOOK_SECRET'}`);
  if (hasRecipient) console.log('\n✅ Ready — rep signing will reach us and trigger the approve prompt.');
  else console.log('\n❌ Add the recipient_completed trigger in the PandaDoc dashboard for auto-onboarding to work.');
}

main().catch(e => { console.error(e); process.exit(1); });
