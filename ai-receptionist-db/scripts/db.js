// Shared Postgres connection helper.
// Reads DATABASE_URL (required) and optional PGSSL from the environment.
require('dotenv').config();
const { Pool } = require('pg');

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  const useSsl = String(process.env.PGSSL).toLowerCase() === 'true';
  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
}

module.exports = { getPool };
