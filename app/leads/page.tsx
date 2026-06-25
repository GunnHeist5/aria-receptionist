import { getPool } from '@/lib/db';
import LeadsView from '@/components/leads/LeadsView';

export const dynamic = 'force-dynamic';

const PER_PAGE = 60;
const FILTERS = ['new', 'callback', 'interested', 'all'] as const;
type Filter = (typeof FILTERS)[number];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { c?: string; status?: string; page?: string };
}) {
  const pool         = getPool();
  const contractorId = searchParams.c?.trim() || null;
  const filter: Filter = FILTERS.includes(searchParams.status as Filter)
    ? (searchParams.status as Filter)
    : 'new';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  // Add tracking columns on first use (idempotent)
  await pool.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_status    VARCHAR(50) DEFAULT 'new';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_notes     TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS claimed_by     VARCHAR(100)
  `);

  // Each contractor sees unclaimed leads + leads they already claimed.
  const baseWhere = `status = 'lead'
    AND COALESCE(call_status, 'new') != 'not_interested'
    AND (claimed_by IS NULL OR claimed_by = $1)`;

  // Tab counts — a single cheap aggregate, no rows transferred.
  const { rows: countRows } = await pool.query(
    `SELECT COALESCE(call_status, 'new') AS s, COUNT(*)::int AS n
     FROM clients WHERE ${baseWhere} GROUP BY 1`,
    [contractorId]
  );
  const counts = { new: 0, callback: 0, interested: 0, all: 0 };
  for (const r of countRows) {
    if (r.s === 'new' || r.s === 'callback' || r.s === 'interested') counts[r.s as 'new'] = r.n;
    counts.all += r.n;
  }

  const statusFilter =
      filter === 'new'        ? `AND COALESCE(call_status, 'new') = 'new'`
    : filter === 'callback'   ? `AND call_status = 'callback'`
    : filter === 'interested' ? `AND call_status = 'interested'`
    : ''; // 'all'

  // Only one page (60 rows) leaves the DB — fast regardless of table size.
  const { rows: leads } = await pool.query(
    `SELECT id, business_name, phone, city, state, website,
            call_status, last_called_at, claimed_by
     FROM   clients
     WHERE  ${baseWhere} ${statusFilter}
     ORDER BY
       CASE WHEN claimed_by = $1 THEN 0 ELSE 1 END,
       CASE COALESCE(call_status, 'new')
         WHEN 'callback'   THEN 1
         WHEN 'new'        THEN 2
         WHEN 'interested' THEN 3
         ELSE 4
       END,
       created_at DESC
     LIMIT ${PER_PAGE} OFFSET ${(page - 1) * PER_PAGE}`,
    [contractorId]
  );

  return (
    <LeadsView
      leads={leads}
      contractorId={contractorId}
      filter={filter}
      page={page}
      perPage={PER_PAGE}
      counts={counts}
    />
  );
}
