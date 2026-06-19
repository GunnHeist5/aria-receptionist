import { getPool } from '@/lib/db';
import AdminDashboard from '@/components/admin/AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const pool = getPool();

  // Add column on first deploy — safe to run every time
  await pool.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS number_verified BOOLEAN NOT NULL DEFAULT false
  `).catch(() => {/* column may already exist with constraints */});

  const [statsRes, clientsRes, eventsRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)          FILTER (WHERE status = 'live')                          AS live_count,
        COALESCE(SUM(mrr) FILTER (WHERE status = 'live'), 0)                      AS total_mrr,
        COUNT(*)          FILTER (WHERE billing_status = 'pending')               AS pending_payment,
        COUNT(*)          FILTER (WHERE billing_status = 'past_due')              AS past_due_count,
        COUNT(*)          FILTER (WHERE status = 'lead')                          AS lead_count,
        COUNT(*)          FILTER (WHERE status = 'won' OR call_status='interested') AS interested_count
      FROM clients
    `),
    pool.query(`
      SELECT id, business_name, city, state, status, billing_status,
             provisioned_number, mrr, activated_at, created_at,
             forward_to_number, number_verified
      FROM clients
      ORDER BY created_at DESC
    `),
    pool.query(`
      SELECT client_id, type, payload, created_at
      FROM events
      ORDER BY created_at DESC
      LIMIT 200
    `),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  return (
    <AdminDashboard
      stats={statsRes.rows[0]}
      clients={clientsRes.rows}
      events={eventsRes.rows}
      baseUrl={baseUrl}
    />
  );
}
