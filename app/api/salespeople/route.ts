import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.slug, c.email,
      c.commission_setup, c.commission_residual_pct, c.created_at,
      COUNT(DISTINCT cl.id)                                              AS client_count,
      COALESCE(SUM(cl.mrr) FILTER (WHERE cl.status = 'live'), 0)        AS attributed_mrr,
      COALESCE(SUM(co.amount) FILTER (WHERE co.status = 'accrued'), 0)  AS owed,
      COALESCE(SUM(co.amount) FILTER (WHERE co.status = 'paid'), 0)     AS paid_total
    FROM contractors c
    LEFT JOIN clients     cl ON cl.contractor_id = c.id
    LEFT JOIN commissions co ON co.contractor_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC NULLS LAST
  `);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, email, slug, commissionSetup, commissionResidualPct } = await req.json();
  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'name and slug required' }, { status: 422 });
  }
  const pool = getPool();
  const { rows: [rep] } = await pool.query(
    `INSERT INTO contractors (name, slug, email, commission_setup, commission_residual_pct)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name.trim(), slug.trim().toLowerCase(), email?.trim() || null,
     Number(commissionSetup) || 0, Number(commissionResidualPct) || 0]
  );
  return NextResponse.json({ id: rep.id }, { status: 201 });
}
