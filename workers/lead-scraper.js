#!/usr/bin/env node
/**
 * Lead scraper — finds plumbing businesses via Google Places API and inserts
 * them into the clients table as status='lead'.
 *
 * Usage:
 *   node workers/lead-scraper.js --location "Philadelphia, PA" --radius 25000
 *   node workers/lead-scraper.js --location "19103" --radius 15000 --max 60
 *
 * Requires GOOGLE_PLACES_API_KEY in .env
 */

'use strict';

const path   = require('path');
const https  = require('https');

// Load env from root .env (dotenv optional — Node 20+ supports --env-file flag)
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../.env') });
  dotenv.config({ path: path.join(__dirname, '../.env.local') });
} catch {
  // dotenv not installed; rely on --env-file or pre-exported env vars
}

const { Pool } = require('pg');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const LOCATION = getArg('--location') ?? 'Philadelphia, PA';
const RADIUS   = parseInt(getArg('--radius') ?? '25000', 10);
const MAX      = parseInt(getArg('--max') ?? '40', 10);
const QUERY    = getArg('--query') ?? 'plumber plumbing';
const LAT      = getArg('--lat')  ? parseFloat(getArg('--lat'))  : null;
const LNG      = getArg('--lng')  ? parseFloat(getArg('--lng'))  : null;

const API_KEY  = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Error: GOOGLE_PLACES_API_KEY is not set in .env');
  process.exit(1);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Google Places API ─────────────────────────────────────────────────────────

// If lat/lng provided, uses coordinate + radius for precision.
// Otherwise embeds location name in query (less precise, no Geocoding API needed).
async function textSearch(query, pageToken) {
  let url;
  if (LAT !== null && LNG !== null) {
    url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${LAT},${LNG}&radius=${RADIUS}&key=${API_KEY}`;
  } else {
    url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${query} in ${LOCATION}`)}&key=${API_KEY}`;
  }
  if (pageToken) url += `&pagetoken=${encodeURIComponent(pageToken)}`;
  return get(url);
}

async function placeDetails(placeId) {
  const fields = 'name,formatted_phone_number,website,formatted_address,address_components,place_id';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${API_KEY}`;
  return get(url);
}

// ── Parse address components ──────────────────────────────────────────────────

function parseAddress(components = []) {
  const get = (type) => components.find(c => c.types.includes(type))?.long_name ?? null;
  return {
    city:  get('locality') ?? get('sublocality') ?? get('administrative_area_level_2'),
    state: components.find(c => c.types.includes('administrative_area_level_1'))?.short_name ?? null,
    zip:   get('postal_code'),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nARIA Lead Scraper`);
  console.log(`Location : ${LAT !== null ? `${LAT}, ${LNG} (±${RADIUS}m)` : `"${LOCATION}" (text search — use --lat/--lng for precision)`}`);
  console.log(`Query    : ${QUERY}`);
  console.log(`Max leads: ${MAX}\n`);

  // Collect place IDs across pages
  const placeIds   = [];
  let   pageToken  = null;
  let   page       = 0;

  while (placeIds.length < MAX) {
    if (page > 0) await sleep(3000); // Google page tokens need ~3s to become valid
    page++;
    console.log(`Fetching page ${page}...`);

    const res = await textSearch(QUERY, pageToken);

    if (res.status === 'ZERO_RESULTS') break;
    if (res.status === 'INVALID_REQUEST') {
      console.log('  No more pages available.');
      break;
    }
    if (res.status !== 'OK') {
      throw new Error(`Places API error: ${res.status} — ${res.error_message ?? ''}`);
    }

    for (const r of (res.results ?? [])) {
      if (placeIds.length >= MAX) break;
      placeIds.push(r.place_id);
    }

    pageToken = res.next_page_token ?? null;
    if (!pageToken) break;
  }

  console.log(`Found ${placeIds.length} places. Fetching details...\n`);

  // Connect to DB
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Cost-saving dedup column (idempotent) + which of these places we already have.
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS place_id VARCHAR(255)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_place_id ON clients(place_id) WHERE place_id IS NOT NULL`);
  let known = new Set();
  if (placeIds.length) {
    const { rows } = await pool.query('SELECT place_id FROM clients WHERE place_id = ANY($1)', [placeIds]);
    known = new Set(rows.map(r => r.place_id));
  }

  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < placeIds.length; i++) {
    // Cost saver: skip the paid Details call for places we've already scraped.
    if (known.has(placeIds[i])) {
      console.log(`  [${i + 1}] SKIP  — place already in DB`);
      skipped++;
      continue;
    }

    await sleep(200); // Rate limit: 5 req/s
    const detailRes = await placeDetails(placeIds[i]);

    if (detailRes.status !== 'OK') {
      console.warn(`  [${i + 1}] Details failed for ${placeIds[i]}: ${detailRes.status}`);
      skipped++;
      continue;
    }

    const d     = detailRes.result;
    const phone = d.formatted_phone_number?.replace(/\D/g, '') ?? null;
    const name  = d.name;
    const site  = d.website ?? null;
    const { city, state, zip } = parseAddress(d.address_components);

    // Fallback dedup by phone (catches leads added from other sources w/o place_id)
    if (phone) {
      const exists = await pool.query('SELECT id FROM clients WHERE phone = $1', [phone]);
      if (exists.rows.length) {
        console.log(`  [${i + 1}] SKIP  ${name} — phone already in DB`);
        skipped++;
        continue;
      }
    }

    // Insert as lead
    try {
      await pool.query(
        `INSERT INTO clients (business_name, phone, city, state, zip, website, place_id, status, billing_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'lead', 'none', NOW(), NOW())`,
        [name, phone, city, state, zip, site, placeIds[i]]
      );
      console.log(`  [${i + 1}] ADD   ${name} — ${phone ?? 'no phone'} (${city ?? '?'}, ${state ?? '?'})`);
      inserted++;
    } catch (err) {
      console.warn(`  [${i + 1}] ERROR ${name}: ${err.message}`);
      skipped++;
    }
  }

  await pool.end();

  console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
