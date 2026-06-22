import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { createCheckoutSession } from '@/lib/stripe';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

// Keywords for detecting trades from free-text service selections.
// Err toward HVAC detection for ambiguous custom services; plumbing is the fallback default.
const HVAC_KW = [
  'ac', 'a/c', 'air condition', 'air quality', 'air purifier', 'air handler',
  'hvac', 'heat pump', 'heating', 'furnace', 'boiler',
  'duct', 'ductwork', 'thermostat', 'refrigerant', 'freon',
  'cooling', 'mini-split', 'mini split', 'blower motor', 'condenser',
  'evaporator', 'compressor', 'variable speed', 'zoning system',
];
const PLUMBING_KW = [
  'plumb', 'drain', 'pipe', 'sewer', 'leak', 'leaking',
  'water heater', 'tankless', 'hydro', 'camera inspection',
  'fixture', 'faucet', 'toilet', 'garbage disposal', 'backflow',
  'water line', 'gas line', 'repiping',
];

function deriveBusinessType(services: string[]): string {
  const lower     = services.map(s => s.toLowerCase());
  const hasHvac   = lower.some(s => HVAC_KW.some(k => s.includes(k)));
  const hasPlumb  = lower.some(s => PLUMBING_KW.some(k => s.includes(k)));
  if (hasHvac && hasPlumb) return 'combined';
  if (hasHvac)             return 'hvac';
  return 'plumbing'; // primary niche; safe default for ambiguous/empty services
}

const HOURS_MAP: Record<string, Record<string, string>> = {
  'mon-fri-8-5':  { 'mon-fri': '08:00-17:00' },
  'mon-fri-7-6':  { 'mon-fri': '07:00-18:00' },
  'mon-sat-8-5':  { 'mon-fri': '08:00-17:00', sat: '08:00-17:00' },
  '247':          { 'mon-sun': '00:00-23:59' },
};

export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    businessName, phone, email, city, state, zip,
    website, pricingNotes,
    forwardToNumber, areaCode, tone, businessHoursPreset,
    services, doNotSay, escalationKeywords, afterHoursBehavior,
    alertPhone, ref, carrier, carrierName,
  } = body;

  if (!businessName?.trim() || !phone?.trim() || !city?.trim() ||
      !state?.trim() || !forwardToNumber?.trim() || !areaCode?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 422 });
  }

  const businessHours  = HOURS_MAP[businessHoursPreset] ?? HOURS_MAP['mon-fri-8-5'];
  const servicesArr    = (services ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const businessType   = deriveBusinessType(servicesArr);
  const doNotSayArr    = (doNotSay ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const escalationArr  = (escalationKeywords ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const alertDest      = alertPhone?.trim() ? { sms: [alertPhone.trim()] } : {};
  // areaCode stored in service_area so provisioning pipeline can read it without a schema change
  const serviceArea    = { radius_miles: 25, areaCode: areaCode.trim() };

  try {
    const pool = getPool();

    // Resolve referring salesperson if a slug was passed
    let contractorId: string | null = null;
    if (ref?.trim()) {
      const { rows } = await pool.query(
        `SELECT id FROM contractors WHERE slug = $1 LIMIT 1`,
        [ref.trim().toLowerCase()]
      );
      contractorId = rows[0]?.id ?? null;
    }

    const { rows: [client] } = await pool.query(
      `INSERT INTO clients (
         status, business_name, business_type, phone, email,
         city, state, zip, website, fit_score, tier, source,
         forward_to_number, tone, business_hours, services_offered,
         service_area, do_not_say, escalation_keywords,
         after_hours_behavior, alert_destination, pricing_notes,
         contractor_id, carrier, carrier_name
       ) VALUES (
         'won', $1, $21, $2, $3,
         $4, $5, $6, $7, 85, 'A', 'intake_form',
         $8, $9, $10::jsonb, $11,
         $12::jsonb, $13::jsonb, $14::jsonb,
         $15, $16::jsonb, $17,
         $18, $19, $20
       ) RETURNING id`,
      [
        businessName.trim(), phone.trim(), email?.trim() || null,
        city.trim(), state.trim(), zip?.trim() || null,
        website?.trim() || null,
        forwardToNumber.trim(), tone || 'professional',
        JSON.stringify(businessHours),
        servicesArr,
        JSON.stringify(serviceArea),
        JSON.stringify(doNotSayArr),
        JSON.stringify(escalationArr),
        afterHoursBehavior || 'voicemail',
        JSON.stringify(alertDest),
        pricingNotes?.trim() || null,
        contractorId,
        carrier?.trim() || null,
        carrierName?.trim() || null,
        businessType,                         // $21
      ]
    );

    // Generate Stripe checkout immediately so the contractor has a payment link to share.
    // If Stripe is not yet configured, return the clientId and skip checkout gracefully.
    let checkoutUrl: string | null = null;
    try {
      const result = await createCheckoutSession({
        clientId:     client.id,
        businessName: businessName.trim(),
        email:        email?.trim() || null,
        successUrl:   `${BASE_URL}/intake/success?name=${encodeURIComponent(businessName.trim())}&paid=true`,
        cancelUrl:    `${BASE_URL}/intake/success?name=${encodeURIComponent(businessName.trim())}&paid=false`,
      });
      checkoutUrl = result.checkoutUrl;
      await pool.query(
        `UPDATE clients
         SET stripe_customer_id = $2,
             billing_status     = 'pending',
             updated_at         = NOW()
         WHERE id = $1`,
        [client.id, result.customerId]
      );
    } catch (stripeErr) {
      // Log but don't fail the client creation — contractor can generate link manually later
      console.error('[POST /api/clients] Stripe checkout failed:', stripeErr);
    }

    return NextResponse.json({ clientId: client.id, checkoutUrl }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/clients]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
