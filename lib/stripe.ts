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

async function onInvoicePaymentSucceeded(invoice: Stripe.Invoice, db: Pool) {
  // Only process monthly renewals — first invoice is handled by checkout.session.completed
  if ((invoice as any).billing_reason !== 'subscription_cycle') return;

  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : (invoice.customer as Stripe.Customer | null)?.id;
  if (!customerId) return;

  const { rows: clientRows } = await db.query(
    `SELECT id, contractor_id, created_at FROM clients WHERE stripe_customer_id = $1 LIMIT 1`,
    [customerId]
  );
  if (!clientRows.length) {
    // Stripe customer not mapped to a client — log and bail
    await db.query(
      `INSERT INTO events (client_id, type, payload) VALUES (NULL, 'other', $1)`,
      [JSON.stringify({ event: 'residual_skipped', reason: 'client_not_found', customerId, invoiceId: invoice.id })]
    );
    return;
  }

  const { id: clientId, contractor_id: contractorId } = clientRows[0];

  if (!contractorId) return; // no rep on this client, nothing to pay

  // Derive period from Stripe's billing period end (deterministic even if webhook is delayed)
  const periodEnd  = (invoice as any).period_end as number; // Unix seconds
  const periodDate = new Date(periodEnd * 1000);
  const period     = `${periodDate.getUTCFullYear()}-${String(periodDate.getUTCMonth() + 1).padStart(2, '0')}`;

  // Gate 1: rep must still be active
  const { rows: [rep] } = await db.query(
    `SELECT active, commission_residual_pct FROM contractors WHERE id = $1`,
    [contractorId]
  );
  if (!rep || !rep.active) {
    await db.query(
      `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
      [clientId, JSON.stringify({ event: 'residual_skipped', reason: 'rep_inactive', contractorId, period, invoiceId: invoice.id })]
    );
    return;
  }

  // Gate 2: 18-month cap — count residual rows already recorded for this client+rep
  const { rows: [capRow] } = await db.query(
    `SELECT COUNT(*) AS n FROM commissions WHERE contractor_id = $1 AND client_id = $2 AND type = 'residual'`,
    [contractorId, clientId]
  );
  if (Number(capRow.n) >= 18) {
    await db.query(
      `INSERT INTO events (client_id, type, payload) VALUES ($1, 'other', $2)`,
      [clientId, JSON.stringify({ event: 'residual_skipped', reason: 'cap_reached', contractorId, period, monthsEarned: Number(capRow.n), invoiceId: invoice.id })]
    );
    return;
  }

  // Idempotent insert — period+contractor+client+type is unique for a renewal month
  const amountPaid = (invoice.amount_paid ?? 0) / 100; // Stripe amount is in cents
  const mrr        = amountPaid > 0 ? amountPaid : MONTHLY_PRICE_CENTS / 100;
  const residual   = Math.round((Number(rep.commission_residual_pct) / 100) * mrr * 100) / 100;

  const { rowCount } = await db.query(
    `INSERT INTO commissions (contractor_id, client_id, type, amount, period, status)
     SELECT $1, $2, 'residual', $3, $4, 'accrued'
     WHERE NOT EXISTS (
       SELECT 1 FROM commissions
       WHERE contractor_id = $1 AND client_id = $2 AND type = 'residual' AND period = $4
     )`,
    [contractorId, clientId, residual, period]
  );

  await db.query(
    `INSERT INTO events (client_id, type, payload) VALUES ($1, 'payment_succeeded', $2)`,
    [clientId, JSON.stringify({
      event:       rowCount && rowCount > 0 ? 'residual_recorded' : 'residual_duplicate_skipped',
      contractorId,
      period,
      amount:      residual,
      monthNumber: Number(capRow.n) + 1,
      invoiceId:   invoice.id,
    })]
  );
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

  // Clawback commissions if client churned within clawback window
  const clawbackDays = parseInt(process.env.COMMISSION_CLAWBACK_DAYS ?? '90', 10);
  const { rows: churned } = await db.query(
    `SELECT contractor_id, created_at FROM clients WHERE id=$1 AND contractor_id IS NOT NULL`, [client.id]
  );
  if (churned.length && churned[0].contractor_id) {
    const daysHeld = Math.floor((Date.now() - new Date(churned[0].created_at).getTime()) / 86_400_000);
    if (daysHeld <= clawbackDays) {
      const { rows: clawed } = await db.query(
        `UPDATE commissions SET status='clawed_back'
         WHERE client_id=$1 AND status='accrued' RETURNING contractor_id, amount`,
        [client.id]
      );
      if (clawed.length) {
        const total = clawed.reduce((s: number, r: any) => s + Number(r.amount), 0).toFixed(2);
        const { rows: [rep] } = await db.query(
          `SELECT channel_id, name FROM contractors WHERE id=$1`, [clawed[0].contractor_id]
        );
        if (rep?.channel_id && process.env.TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: rep.channel_id,
              text: `⚠️ Commission clawback: a client you brought in canceled within ${clawbackDays} days. $${total} has been reversed per your contractor agreement.`,
            }),
          });
        }
      }
    }
  }

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
    case 'invoice.payment_succeeded':
      await onInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, db);
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
