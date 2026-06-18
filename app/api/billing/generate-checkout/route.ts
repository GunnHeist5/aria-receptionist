import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { createCheckoutSession } from '@/lib/stripe';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  let body: { clientId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { clientId } = body;
  if (!clientId?.trim()) {
    return NextResponse.json({ error: 'clientId required' }, { status: 422 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, business_name, email, stripe_customer_id FROM clients WHERE id = $1',
    [clientId]
  );
  if (!rows.length) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const client = rows[0];

  try {
    const { customerId, checkoutUrl } = await createCheckoutSession({
      clientId:     client.id,
      businessName: client.business_name,
      email:        client.email,
      successUrl:   `${BASE_URL}/intake/success?name=${encodeURIComponent(client.business_name)}&paid=true`,
      cancelUrl:    `${BASE_URL}/intake/success?name=${encodeURIComponent(client.business_name)}&paid=false`,
    });

    await pool.query(
      `UPDATE clients
       SET stripe_customer_id = $2,
           billing_status     = 'pending',
           updated_at         = NOW()
       WHERE id = $1`,
      [clientId, customerId]
    );

    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error('[generate-checkout]', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
