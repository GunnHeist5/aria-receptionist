import { NextRequest, NextResponse } from 'next/server';
import { stripe, handleStripeWebhook } from '@/lib/stripe';
import { getPool } from '@/lib/db';

// Stripe requires the raw body bytes for signature verification.
// Next.js App Router provides the raw body via req.text() — do NOT use req.json().
export const dynamic = 'force-dynamic';

// TRILLET_API_KEY + TRILLET_WORKSPACE_ID must be in .env.local for deprovision to work.
// The voice-provider CJS module reads them from process.env at construction time.
function makeDeprovisionFn() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createVoiceProvider } = require('../../../../voice-provider/src/index');
  const provider = createVoiceProvider();
  return async (accountId: string) => {
    await provider.deprovision(accountId);
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  const payload   = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] signature verification failed:', msg);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const pool          = getPool();
    const deprovisionFn = makeDeprovisionFn();
    await handleStripeWebhook(event, pool, deprovisionFn);
  } catch (err) {
    // Log but return 200 — Stripe retries on non-2xx, and a handler crash
    // shouldn't trigger infinite retries for events we can't process.
    console.error('[stripe-webhook] handler error:', event.type, err);
  }

  return NextResponse.json({ received: true });
}
