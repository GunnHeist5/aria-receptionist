// verify.js — health check for the spine.
// Confirms every table + enum exists, runs representative queries, prints results.
// Exits non-zero if anything structural is missing, so it can gate CI / deploys.
const { getPool } = require('./db');

const EXPECTED_TABLES = [
  'clients',
  'contractors',
  'captured_leads',
  'events',
  'commissions',
  'onboarding_runs',
];

const EXPECTED_ENUMS = [
  'client_status',
  'business_type',
  'tier_level',
  'tone',
  'after_hours_behavior',
  'billing_status',
  'contractor_status',
  'event_type',
  'commission_type',
  'commission_status',
  'onboarding_status',
];

const FAILURE_EVENT_TYPES = ['payment_failed', 'call_forward_failure'];

function line() {
  console.log('-'.repeat(64));
}

async function main() {
  const pool = getPool();
  let ok = true;
  try {
    // --- connectivity ------------------------------------------------------
    const ping = await pool.query('select current_database() as db, version() as v');
    console.log(`Connected to "${ping.rows[0].db}"`);
    console.log(ping.rows[0].v.split(',')[0]);
    line();

    // --- tables present ----------------------------------------------------
    const tables = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`
    );
    const tableSet = new Set(tables.rows.map((r) => r.table_name));
    console.log('Tables:');
    for (const t of EXPECTED_TABLES) {
      const present = tableSet.has(t);
      ok = ok && present;
      console.log(`  ${present ? 'ok ' : 'MISSING'} ${t}`);
    }
    line();

    // --- enums present -----------------------------------------------------
    const enums = await pool.query(
      `select typname from pg_type where typtype = 'e'`
    );
    const enumSet = new Set(enums.rows.map((r) => r.typname));
    console.log('Enums:');
    for (const e of EXPECTED_ENUMS) {
      const present = enumSet.has(e);
      ok = ok && present;
      console.log(`  ${present ? 'ok ' : 'MISSING'} ${e}`);
    }
    line();

    // --- row counts (sanity) ----------------------------------------------
    const counts = await pool.query(`
      select
        (select count(*) from clients)         as clients,
        (select count(*) from contractors)     as contractors,
        (select count(*) from captured_leads)  as captured_leads,
        (select count(*) from events)          as events,
        (select count(*) from commissions)     as commissions,
        (select count(*) from onboarding_runs) as onboarding_runs
    `);
    console.log('Row counts:', counts.rows[0]);
    line();

    // --- representative query 1: all live clients --------------------------
    const live = await pool.query(
      `select business_name, voice_provider, provisioned_number, mrr, billing_status
       from clients
       where status = 'live'
       order by business_name`
    );
    console.log(`Live clients (${live.rowCount}):`);
    live.rows.forEach((r) =>
      console.log(
        `  ${r.business_name} — ${r.voice_provider} ${r.provisioned_number} — $${r.mrr}/mo (${r.billing_status})`
      )
    );
    line();

    // --- representative query 2: a contractor's accrued commissions --------
    const accrued = await pool.query(
      `select co.name, c.type, c.amount, c.period
       from commissions c
       join contractors co on co.id = c.contractor_id
       where c.status = 'accrued'
       order by co.name, c.period`
    );
    console.log(`Accrued commissions (${accrued.rowCount}):`);
    accrued.rows.forEach((r) =>
      console.log(`  ${r.name} — ${r.type} $${r.amount} (${r.period})`)
    );
    line();

    // --- representative query 3: recent failure events ---------------------
    const failures = await pool.query(
      `select e.type, e.created_at, coalesce(cl.business_name, '(global)') as client, e.payload
       from events e
       left join clients cl on cl.id = e.client_id
       where e.type = any($1)
       order by e.created_at desc
       limit 10`,
      [FAILURE_EVENT_TYPES]
    );
    console.log(`Recent failure events (${failures.rowCount}):`);
    failures.rows.forEach((r) =>
      console.log(`  ${r.created_at.toISOString()} ${r.type} — ${r.client} — ${JSON.stringify(r.payload)}`)
    );
    line();

    // --- representative query 4: pipeline by status ------------------------
    const pipeline = await pool.query(
      `select status, count(*)::int as n from clients group by status order by n desc`
    );
    console.log('Pipeline by status:');
    pipeline.rows.forEach((r) => console.log(`  ${r.status.padEnd(13)} ${r.n}`));
    line();

    if (ok) {
      console.log('VERIFY OK — schema present and queries succeeded.');
    } else {
      console.error('VERIFY FAILED — one or more tables/enums missing (run `npm run migrate`).');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('VERIFY ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
