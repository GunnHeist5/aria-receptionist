'use strict';
// List PandaDoc templates with their IDs and signer roles, to pick the right
// PANDADOC_TEMPLATE_ID (and confirm role names for the recipients we send).
//   node --env-file=.env scripts/list-templates.js

async function main() {
  const key = (process.env.PANDADOC_API_KEY || '').trim();
  const r = await fetch('https://api.pandadoc.com/public/v1/templates?count=50',
    { headers: { Authorization: `API-Key ${key}` } });
  if (!r.ok) { console.error('List failed:', r.status, (await r.text()).slice(0, 300)); process.exit(1); }

  const data = await r.json();
  const list = data.results || [];
  if (!list.length) { console.log('No templates found.'); return; }

  console.log(`Found ${list.length} template(s).`);
  console.log(`Current PANDADOC_TEMPLATE_ID = ${(process.env.PANDADOC_TEMPLATE_ID || '(unset)').trim()}`);
  console.log(`Current rep role  = ${(process.env.PANDADOC_RECIPIENT_ROLE || '(unset)').trim()}`);
  console.log(`Current company role = ${(process.env.PANDADOC_COMPANY_ROLE || '(unset)').trim()}\n`);

  for (const t of list) {
    let roles = '(could not fetch)';
    try {
      const dr = await fetch(`https://api.pandadoc.com/public/v1/templates/${t.id}/details`,
        { headers: { Authorization: `API-Key ${key}` } });
      if (dr.ok) { const d = await dr.json(); roles = (d.roles || []).map(x => x.name).join(', ') || '(no roles)'; }
    } catch { /* ignore */ }
    console.log(`• ${t.name}`);
    console.log(`    id:    ${t.id}`);
    console.log(`    roles: ${roles}\n`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
