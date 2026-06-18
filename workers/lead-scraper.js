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

async function geocodeLocation(location) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${API_KEY}`;
  const data = await get(url);
  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed for "${location}": ${data.status}`);
  }
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

async function textSearch(query, lat, lng, radius, pageToken) {
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${API_KEY}`;
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
  console.log(`Location : ${LOCATION}`);
  console.log(`Radius   : ${RADIUS}m`);
  console.log(`Query    : ${QUERY}`);
  console.log(`Max leads: ${MAX}\n`);

  // Geocode
  console.log('Geocoding location...');
  const { lat, lng } = await geocodeLocation(LOCATION);
  console.log(`Coordinates: ${lat}, ${lng}\n`);

  // Collect place IDs across pages
  const placeIds   = [];
  let   pageToken  = null;
  let   page       = 0;

  while (placeIds.length < MAX) {
    if (page > 0) await sleep(2000); // Google requires a short delay between pages
    page++;
    console.log(`Fetching page ${page}...`);

    const res = await textSearch(QUERY, lat, lng, RADIUS, pageToken);

    if (res.status !== 'OK' && res.status !== 'ZERO_RESULTS') {
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

  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < placeIds.length; i++) {
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

    // Skip if phone already exists in DB
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
        `INSERT INTO clients (business_name, phone, city, state, zip, website, status, billing_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'lead', 'none', NOW(), NOW())`,
        [name, phone, city, state, zip, site]
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
