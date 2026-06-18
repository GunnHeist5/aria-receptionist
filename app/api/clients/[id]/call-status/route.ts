import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const VALID = ['new', 'called', 'interested', 'not_interested', 'callback'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { status } = await req.json();
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `UPDATE clients
     SET call_status    = $2,
         last_called_at = NOW(),
         updated_at     = NOW()
     WHERE id = $1`,
    [params.id, status]
  );

  // Promote to 'won' when a contractor marks as interested
  if (status === 'interested') {
    await pool.query(
      `UPDATE clients SET status = 'won', updated_at = NOW() WHERE id = $1`,
      [params.id]
    );
    await pool.query(
      `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
      [params.id, JSON.stringify({ event: 'lead_interested' })]
    );
  }

  return NextResponse.json({ ok: true });
}
