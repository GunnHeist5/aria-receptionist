import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { commissionSetup, commissionResidualPct } = await req.json();
  const pool = getPool();
  await pool.query(
    `UPDATE contractors
     SET commission_setup        = $2,
         commission_residual_pct = $3
     WHERE id = $1`,
    [params.id, Number(commissionSetup) || 0, Number(commissionResidualPct) || 0]
  );
  return NextResponse.json({ ok: true });
}
