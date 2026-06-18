import Stripe from 'stripe';
import type { Pool } from 'pg';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---------------------------------------------------------------------------
// Configurable pricing — change via env, never hardcode per-client
// ---------------------------------------------------------------------------
export const SETUP_FEE_CENTS     = parseInt(process.env.SETUP_FEE_CENTS     ?? '50000', 10); // $500
export const MONTHLY_PRICE_CENTS = parseInt(process.env.MONTHLY_PRICE_CENTS ?? '29700', 10); // $297

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Customer and a Checkout Session that combines:
 *   - one-time setup fee (charged on first invoice)
 *   - recurring monthly subscription
 *
 * Both have clientId in metadata so every webhook can identify the DB row.
 */
export async function createCheckoutSession(opts: {
  clientId:     string;
  businessName: string;
  email:        string | null;
  successUrl:   string;
  cancelUrl:    string;
}): Promise<{ customerId: string; checkoutUrl: string }> {
  const customer = await stripe.customers.create({
    name:     opts.businessName,
    email:    opts.email ?? undefined,
    metadata: { clientId: opts.clientId },
  });

  const session = await stripe.checkout.sessions.create({
    mode:     'subscription',
    customer: customer.id,
    line_items: [
      {
        price_data: {
          currency:     'usd',
          product_data: { name: 'AI Receptionist — Monthly Service' },
          unit_amount:  MONTHLY_PRICE_CENTS,
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      },
      {
        price_data: {
          currency:     'usd',
          product_data: { name: 'AI Receptionist — One-Time Setup Fee' },
          unit_amount:  SETUP_FEE_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata:          { clientId: opts.clientId },
    subscription_data: { metadata: { clientId: opts.clientId } },
    success_url: opts.successUrl,
    cancel_url:  opts.cancelUrl,
  });

  return { customerId: customer.id, checkoutUrl: session.url! };
}

// ---------------------------------------------------------------------------
// Commission helper
// ---------------------------------------------------------------------------

async function recordCommissions(
  db:           Pool,
  clientId:     string,
  contractorId: string | null,
  mrr:          number,
) {
  if (!contractorId) return;
  const { rows } = await db.query(
    'SELECT commission_setup, commission_residual_pct FROM contractors WHERE id = $1',
    [contractorId]
  );
  if (!rows.length) return;

  const { commission_setup, commission_residual_pct } = rows[0];
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  if (Number(commission_setup) > 0) {
    await db.query(
      `INSERT INTO commissions (contractor_id, client_id, type, amount, period, status)
       VALUES ($1, $2, 'setup', $3, $4, 'accrued')`,
      [contractorId, clientId, Number(commission_setup), period]
    );
  }
  if (Number(commission_residual_pct) > 0) {
    const residual = Math.round((Number(commission_residual_pct) / 100) * mrr * 100) / 100;
    await db.query(
      `INSERT INTO commissions (contractor_id, client_id, type, amount, period, status)
       VALUES ($1, $2, 'residual', $3, $4, 'accrued')`,
      [contractorId, clientId, residual, period]
    );
  }
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

async function onCheckoutComplete(session: Stripe.Checkout.Session, db: Pool) {
  const clientId = session.metadata?.clientId;
  if (!clientId) return;

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : (session.subscription as Stripe.Subscription | null)?.id ?? null;

  await db.query(
    `UPDATE clients
     SET billing_status         = 'active',
         setup_fee_paid         = true,
         stripe_subscription_id = $2,
         mrr                    = $3,
         updated_at             = NOW()
     WHERE id = $1`,
    [clientId, subscriptionId, MONTHLY_PRICE_CENTS / 100]
  );

  await db.query(
    `INSERT INTO events (client_id, type, payload) VALUES ($1, 'payment_succeeded', $2)`,
    [clientId, JSON.stringify({
      event:          'checkout.session.completed',
      stripeSession:  session.id,
      subscriptionId,
      amountTotal:    session.amount_total,
    })]
  );

  // Record contractor commissions
  const { rows } = await db.query(
    'SELECT contractor_id FROM clients WHERE id = $1',
    [clientId]
  );
  if (rows.length) {
    await recordCommissions(db, clientId, rows[0].contractor_id, MONTHLY_PRICE_CENTS / 100);
  }
}

async function onPaymentFailed(invoice: Stripe.Invoice, db: Pool, deprovisionFn: DeprovisionFn) {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : (invoice.customer as Stripe.Customer | null)?.id;
  if (!customerId) return;

  const { rows } = await db.query(
    'SELECT id FROM clients WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!rows.length) return;
  const clientId     = rows[0].id;
  const attemptCount = (invoice as any).attempt_count ?? 1;

  await db.query(
    `UPDATE clients SET billing_status = 'past_due', updated_at = NOW() WHERE id = $1`,
    [clientId]
  );
  await db.query(
    `INSERT INTO events (client_id, type, payload) VALUES ($1, 'payment_failed', $2)`,
    [clientId, JSON.stringify({
      event: 'invoice.payment_failed',
      invoiceId: invoice.id,
      attemptCount,
    })]
  );

  // 2nd failed attempt → cancel subscription immediately; subscription.deleted webhook
  // will handle DB churn + deprovision.
  if (attemptCount >= 2) {
    const sub            = (invoice as any).subscription;
    const subscriptionId = typeof sub === 'string' ? sub : (sub as Stripe.Subscription | null)?.id;

    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.query(
          `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
          [clientId, JSON.stringify({ event: 'auto_cancel_failed', error: msg, attemptCount })]
        );
      }
    }
  }
}

async function onSubscriptionCanceled(
  subscription: Stripe.Subscription,
  db: Pool,
  deprovisionFn: DeprovisionFn,
) {
  const clientId   = subscription.metadata?.clientId;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : (subscription.customer as Stripe.Customer | null)?.id;

  const lookup = clientId
    ? await db.query(
        'SELECT id, voice_provider_account_id, status FROM clients WHERE id = $1',
        [clientId]
      )
    : await db.query(
        'SELECT id, voice_provider_account_id, status FROM clients WHERE stripe_customer_id = $1',
        [customerId]
      );

  if (!lookup.rows.length) return;
  const client = lookup.rows[0];

  await db.query(
    `UPDATE clients
     SET billing_status = 'canceled',
         status         = 'churned',
         churned_at     = NOW(),
         updated_at     = NOW()
     WHERE id = $1`,
    [client.id]
  );

  await db.query(
    `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
    [client.id, JSON.stringify({ event: 'subscription_canceled', subscriptionId: subscription.id })]
  );

  // Deprovision voice resources if the client was live
  if (client.voice_provider_account_id && client.status === 'live') {
    try {
      await deprovisionFn(client.voice_provider_account_id);
      await db.query(
        `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
        [client.id, JSON.stringify({ event: 'deprovision_completed', accountId: client.voice_provider_account_id })]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.query(
        `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
        [client.id, JSON.stringify({ event: 'deprovision_failed', error: msg })]
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Public dispatcher — called by the webhook route
// ---------------------------------------------------------------------------

export type DeprovisionFn = (accountId: string) => Promise<void>;

export async function handleStripeWebhook(
  event:         Stripe.Event,
  db:            Pool,
  deprovisionFn: DeprovisionFn,
) {
  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutComplete(event.data.object as Stripe.Checkout.Session, db);
      break;
    case 'invoice.payment_failed':
      await onPaymentFailed(event.data.object as Stripe.Invoice, db, deprovisionFn);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionCanceled(event.data.object as Stripe.Subscription, db, deprovisionFn);
      break;
    // All other events silently ignored — Stripe sends dozens of event types
  }
}
