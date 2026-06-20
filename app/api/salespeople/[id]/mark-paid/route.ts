import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE commissions
     SET status  = 'paid',
         paid_at = NOW()
     WHERE contractor_id = $1 AND status = 'accrued'`,
    [params.id]
  );
  return NextResponse.json({ marked: rowCount });
}
