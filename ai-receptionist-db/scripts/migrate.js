// migrate.js — applies pending SQL migrations in migrations/ in filename order.
// Each migration runs inside a transaction and is recorded in schema_migrations,
// so re-running is safe and idempotent.
const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query('select filename from schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip   ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  apply  ${file} ...`);
      try {
        // One transaction per migration: the schema changes AND the bookkeeping
        // row commit together, so a crash never leaves a half-applied migration.
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations(filename) values ($1)', [file]);
        await client.query('commit');
        count++;
        console.log(`  done   ${file}`);
      } catch (err) {
        await client.query('rollback').catch(() => {});
        console.error(`  FAILED ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log(count === 0 ? 'Up to date — no migrations to apply.' : `Applied ${count} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
