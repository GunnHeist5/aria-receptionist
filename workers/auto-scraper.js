#!/usr/bin/env node
/**
 * ARIA Auto Lead Scraper
 * Cycles through every US city × every service query, inserting leads.
 * Tracks progress in DB — re-scrapes each city after STALE_DAYS.
 *
 * Run via PM2 cron (see ecosystem.config.js) or manually:
 *   node --env-file=/var/www/aria/.env workers/auto-scraper.js
 *   node --env-file=/var/www/aria/.env workers/auto-scraper.js --batch 5
 *
 * To add a new service type: edit workers/queries.json.
 * To add new cities: edit workers/targets.json.
 */

'use strict';

const path  = require('path');
const https = require('https');

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../.env') });
  dotenv.config({ path: path.join(__dirname, '../.env.local') });
} catch { /* dotenv optional — use --env-file flag */ }

const { Pool } = require('pg');
const targets  = require('./targets.json');
const queries  = require('./queries.json');

// ── Args ──────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const getArg     = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const BATCH      = parseInt(getArg('--batch')      ?? '3',  10);
const STALE_DAYS = parseInt(getArg('--stale-days') ?? '30', 10);

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) { console.error('GOOGLE_PLACES_API_KEY not set'); process.exit(1); }

// ── HTTP ──────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

// ── Places API ────────────────────────────────────────────────────────────────
async function textSearch(query, lat, lng, radius, pageToken) {
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${API_KEY}`;
  if (pageToken) url += `&pagetoken=${encodeURIComponent(pageToken)}`;
  return get(url);
}

async function placeDetails(placeId) {
  const fields = 'name,formatted_phone_number,website,address_components';
  return get(`https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}&fields=${fields}&key=${API_KEY}`);
}

function parseAddress(components = []) {
  const g = t => components.find(c => c.types.includes(t))?.long_name ?? null;
  return {
    city:  g('locality') ?? g('sublocality') ?? g('administrative_area_level_2'),
    state: components.find(c => c.types.includes('administrative_area_level_1'))?.short_name ?? null,
    zip:   g('postal_code'),
  };
}

// ── Scrape one city + query ───────────────────────────────────────────────────
async function scrapeJob(pool, target, queryDef) {
  const { lat, lng, radius, name, state } = target;

  // Collect up to 60 place IDs (3 pages max)
  const placeIds = [];
  let pageToken  = null;
  let page       = 0;

  while (placeIds.length < 60) {
    if (page > 0) await sleep(3000);
    page++;
    const res = await textSearch(queryDef.query, lat, lng, radius, pageToken);
    if (res.status === 'ZERO_RESULTS' || res.status === 'INVALID_REQUEST') break;
    if (res.status !== 'OK') throw new Error(`Places error: ${res.status} — ${res.error_message ?? ''}`);
    for (const r of res.results ?? []) placeIds.push(r.place_id);
    pageToken = res.next_page_token ?? null;
    if (!pageToken) break;
  }

  let inserted = 0;
  let skipped  = 0;

  for (const placeId of placeIds) {
    await sleep(200);
    const dr = await placeDetails(placeId);
    if (dr.status !== 'OK') { skipped++; continue; }

    const d     = dr.result;
    const phone = d.formatted_phone_number?.replace(/\D/g, '') ?? null;
    const addr  = parseAddress(d.address_components ?? []);

    // Skip if phone already in DB
    if (phone) {
      const { rows } = await pool.query('SELECT id FROM clients WHERE phone = $1', [phone]);
      if (rows.length) { skipped++; continue; }
    }

    try {
      await pool.query(
        `INSERT INTO clients
           (business_name, phone, city, state, zip, website, status, billing_status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'lead','none',NOW(),NOW())`,
        [d.name, phone, addr.city ?? name, addr.state ?? state, addr.zip, d.website ?? null]
      );
      inserted++;
    } catch { skipped++; }
  }

  return { inserted, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Create progress table if missing
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scraper_log (
      id         SERIAL PRIMARY KEY,
      job_key    VARCHAR(200) UNIQUE,
      city_name  VARCHAR(100),
      state      VARCHAR(20),
      query_key  VARCHAR(50),
      leads_in   INT DEFAULT 0,
      leads_skip INT DEFAULT 0,
      last_run   TIMESTAMPTZ,
      run_count  INT DEFAULT 0
    )
  `);

  // Full job matrix: every target × every query
  const allJobs = targets.flatMap(t =>
    queries.map(q => ({
      key:    `${t.name}_${t.state}_${q.key}`.toLowerCase().replace(/[\s.]+/g, '_'),
      target: t,
      query:  q,
    }))
  );

  // Find jobs that are stale (never run, or last run > STALE_DAYS ago)
  const { rows: recent } = await pool.query(
    `SELECT job_key FROM scraper_log WHERE last_run > NOW() - ($1 || ' days')::INTERVAL`,
    [STALE_DAYS]
  );
  const recentKeys = new Set(recent.map(r => r.job_key));
  const pending    = allJobs.filter(j => !recentKeys.has(j.key));

  const totalJobs = allJobs.length;
  const done      = totalJobs - pending.length;

  console.log(`\nARIA Auto Scraper — ${new Date().toISOString()}`);
  console.log(`Cities: ${targets.length}  Queries: ${queries.length}  Total jobs: ${totalJobs}`);
  console.log(`Completed (last ${STALE_DAYS}d): ${done}  Pending: ${pending.length}`);
  console.log(`Running ${Math.min(BATCH, pending.length)} jobs this run.\n`);

  if (!pending.length) {
    console.log('All jobs up to date — nothing to do.');
    await pool.end();
    return;
  }

  const batch = pending.slice(0, BATCH);

  for (const job of batch) {
    const label = `${job.target.name}, ${job.target.state} [${job.query.key}]`;
    process.stdout.write(`  ${label.padEnd(45)} `);
    try {
      const { inserted, skipped } = await scrapeJob(pool, job.target, job.query);
      await pool.query(
        `INSERT INTO scraper_log (job_key, city_name, state, query_key, leads_in, leads_skip, last_run, run_count)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),1)
         ON CONFLICT (job_key) DO UPDATE SET
           leads_in   = scraper_log.leads_in   + $5,
           leads_skip = scraper_log.leads_skip + $6,
           last_run   = NOW(),
           run_count  = scraper_log.run_count  + 1`,
        [job.key, job.target.name, job.target.state, job.query.key, inserted, skipped]
      );
      console.log(`+${inserted} leads`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  const remaining = pending.length - batch.length;
  const etaDays   = remaining > 0 ? (remaining / (BATCH * 24)).toFixed(1) : 0;
  console.log(`\nDone. ${remaining} jobs remaining${remaining > 0 ? ` (~${etaDays} days at current rate)` : ' — full cycle complete'}.`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
