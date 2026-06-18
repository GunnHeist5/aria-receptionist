import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { createCheckoutSession } from '@/lib/stripe';

const VALID    = ['new', 'called', 'interested', 'not_interested', 'callback'];
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { status, contractorId } = await req.json();
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `UPDATE clients
     SET call_status    = $2,
         claimed_by     = COALESCE($3, claimed_by),
         last_called_at = NOW(),
         updated_at     = NOW()
     WHERE id = $1`,
    [params.id, status, contractorId ?? null]
  );

  if (status !== 'interested') return NextResponse.json({ ok: true });

  // Mark as won
  await pool.query(
    `UPDATE clients SET status = 'won', updated_at = NOW() WHERE id = $1`,
    [params.id]
  );
  await pool.query(
    `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
    [params.id, JSON.stringify({ event: 'lead_interested', claimedBy: contractorId })]
  );

  // Generate payment link so contractor can send it immediately
  const { rows } = await pool.query(
    'SELECT id, business_name, email FROM clients WHERE id = $1',
    [params.id]
  );
  if (!rows.length) return NextResponse.json({ ok: true });

  try {
    const { customerId, checkoutUrl } = await createCheckoutSession({
      clientId:     rows[0].id,
      businessName: rows[0].business_name,
      email:        rows[0].email ?? null,
      successUrl:   `${BASE_URL}/intake/success?name=${encodeURIComponent(rows[0].business_name)}&paid=true`,
      cancelUrl:    `${BASE_URL}/intake/success?name=${encodeURIComponent(rows[0].business_name)}&paid=false`,
    });
    await pool.query(
      `UPDATE clients SET stripe_customer_id = $2, billing_status = 'pending', updated_at = NOW() WHERE id = $1`,
      [params.id, customerId]
    );
    return NextResponse.json({ ok: true, checkoutUrl });
  } catch {
    return NextResponse.json({ ok: true }); // non-fatal
  }
}
