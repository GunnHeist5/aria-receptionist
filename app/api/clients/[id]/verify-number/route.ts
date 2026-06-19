import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const pool = getPool();
  await pool.query(
    `UPDATE clients SET number_verified = true, updated_at = NOW() WHERE id = $1`,
    [params.id]
  );
  return NextResponse.json({ ok: true });
}
