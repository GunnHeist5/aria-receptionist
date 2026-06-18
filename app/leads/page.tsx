import { getPool } from '@/lib/db';
import LeadsView from '@/components/leads/LeadsView';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const pool = getPool();

  // Add call tracking columns if they don't exist yet
  await pool.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_status   VARCHAR(50) DEFAULT 'new';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_notes    TEXT
  `);

  const { rows: leads } = await pool.query(`
    SELECT id, business_name, phone, city, state, website,
           call_status, last_called_at
    FROM   clients
    WHERE  status = 'lead'
    AND    COALESCE(call_status, 'new') != 'not_interested'
    ORDER BY
      CASE COALESCE(call_status,'new')
        WHEN 'callback'    THEN 1
        WHEN 'new'         THEN 2
        WHEN 'interested'  THEN 3
        ELSE 4
      END,
      created_at DESC
  `);

  return <LeadsView leads={leads} />;
}
