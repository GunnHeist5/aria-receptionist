#!/usr/bin/env node
'use strict';

/**
 * Email enricher — extracts contact emails from lead websites we already have.
 * Google Places never returns emails, so scraped leads have website+phone only;
 * this fills clients.email from each lead's own site (homepage + contact page).
 *
 *   node --env-file=.env workers/email-enricher.js            # 200 leads/run
 *   node --env-file=.env workers/email-enricher.js --max 1000
 *
 * Idempotent: every attempt stamps email_checked_at, so re-runs only process
 * leads never tried before. Zero external services — plain HTTP + regex.
 */

const path = require('path');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../.env') });
} catch { /* --env-file covers it */ }

const { Pool } = require('pg');

const args = process.argv.slice(2);
const getArg = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const MAX = parseInt(getArg('--max') ?? '200', 10);

// Junk emails we never want (asset filenames, platform noise, placeholders).
const JUNK = /\.(png|jpg|jpeg|gif|svg|webp|css|js)$|example\.|sentry\.|wixpress\.|godaddy\.|domain\.com$|email\.com$|@(2x|3x)\b|no-?reply|noreply|@sentry|schema\.org/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReachwellBot/1.0)' },
    });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!/text|html/.test(type)) return '';
    return (await res.text()).slice(0, 500_000);
  } catch { return ''; }
}

/** Pull candidate emails from HTML, best-first. */
function extractEmails(html, siteHost) {
  if (!html) return [];
  const found = new Set();
  // mailto: links first — highest confidence
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) found.add(m[1].toLowerCase());
  for (const m of html.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());

  const cleaned = [...found].filter(e => !JUNK.test(e) && e.length < 60);
  // Rank: same-domain first, then common business prefixes, then the rest.
  const domain = (siteHost || '').replace(/^www\./, '');
  return cleaned.sort((a, b) => {
    const score = e =>
      (domain && e.endsWith('@' + domain) ? 0 : 2) +
      (/^(info|office|contact|service|hello|admin|support)@/.test(e) ? 0 : 1);
    return score(a) - score(b);
  });
}

async function enrichLead(lead) {
  let base;
  try { base = new URL(/^https?:/i.test(lead.website) ? lead.website : 'http://' + lead.website); }
  catch { return null; }

  const pages = [base.href];
  for (const p of ['contact', 'contact-us', 'about', 'about-us']) {
    pages.push(new URL('/' + p, base.origin).href);
  }

  for (const url of pages) {
    const html = await fetchPage(url);
    const emails = extractEmails(html, base.host);
    if (emails.length) return emails[0];
    await sleep(300);
  }
  return null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_checked_at TIMESTAMPTZ`);

  const { rows: leads } = await pool.query(
    `SELECT id, business_name, website
     FROM clients
     WHERE status = 'lead'
       AND website IS NOT NULL AND website != ''
       AND (email IS NULL OR email = '')
       AND email_checked_at IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [MAX]
  );

  console.log(`Email enricher — ${leads.length} lead(s) to try\n`);
  let found = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const email = await enrichLead(lead);
    // Stamp the attempt either way — never re-crawl the same site.
    await pool.query(
      `UPDATE clients SET email = COALESCE(NULLIF($2, ''), email), email_checked_at = NOW() WHERE id = $1`,
      [lead.id, email ?? '']
    );
    if (email) { found++; console.log(`  [${i + 1}/${leads.length}] ✓ ${lead.business_name} → ${email}`); }
    else console.log(`  [${i + 1}/${leads.length}] ✗ ${lead.business_name} — none found`);
    await sleep(500); // be a polite crawler
  }

  console.log(`\nDone. Found emails for ${found}/${leads.length} (${leads.length ? Math.round(100 * found / leads.length) : 0}%).`);
  const { rows: [tot] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') AS with_email,
            COUNT(*) AS total FROM clients WHERE status='lead'`);
  console.log(`Lead list now: ${tot.with_email}/${tot.total} leads have an email.`);
  await pool.end();
}

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
}

module.exports = { extractEmails, enrichLead, fetchPage };
