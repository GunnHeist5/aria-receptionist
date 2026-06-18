import { getPool } from '@/lib/db';
import LeadsView from '@/components/leads/LeadsView';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const pool         = getPool();
  const contractorId = searchParams.c?.trim() || null;

  // Add tracking columns on first use
  await pool.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_status    VARCHAR(50) DEFAULT 'new';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_notes     TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS claimed_by     VARCHAR(100)
  `);

  // Each contractor sees: unclaimed leads + leads they already claimed.
  // Leads claimed by someone else are hidden so no double-calling.
  const { rows: leads } = await pool.query(`
    SELECT id, business_name, phone, city, state, website,
           call_status, last_called_at, claimed_by
    FROM   clients
    WHERE  status = 'lead'
    AND    COALESCE(call_status, 'new') != 'not_interested'
    AND    (claimed_by IS NULL OR claimed_by = $1)
    ORDER BY
      CASE WHEN claimed_by = $1 THEN 0 ELSE 1 END,
      CASE COALESCE(call_status, 'new')
        WHEN 'callback'   THEN 1
        WHEN 'new'        THEN 2
        WHEN 'interested' THEN 3
        ELSE 4
      END,
      created_at DESC
  `, [contractorId]);

  return <LeadsView leads={leads} contractorId={contractorId} />;
}
