'use strict';

/**
 * Shape-shifting demo line.
 *
 * One shared demo agent (the "Murphy's Plumbing" line) gets its call-flow
 * re-skinned to answer as ANY lead's business, using the same content-pack
 * builders + provider.applyContentPack the real provisioning pipeline uses.
 * A prospect calls the demo number and hears their own front desk.
 *
 * State lives in a single-row table (demo_line_state) so the sales worker can
 * auto-reset the line back to Murphy's default after DEMO_RESET_MINUTES.
 */

const { buildPlumbingV1 } = require('./content-packs/plumbing-v1');
const { buildHvacV1 }     = require('./content-packs/hvac-v1');
const { buildCombinedV1 } = require('./content-packs/combined-v1');

const DEMO_AGENT_ID = (process.env.DEMO_AGENT_ID || '6a321dc329908759d8970443').trim();
const DEMO_NUMBER   = (process.env.DEMO_NUMBER   || '+1 (215) 702-6522').trim();
const RESET_MINUTES = parseInt(process.env.DEMO_RESET_MINUTES || '30', 10);

// The line's default identity (what it resets to between demos).
const MURPHY_DEFAULT = {
  business_name: "Murphy's Plumbing, Heating and Air Conditioning",
  business_type: 'combined',
  city:          'Philadelphia',
  state:         'PA',
};
const MURPHY_GREETING =
  "Thank you for calling Murphy's Plumbing, Heating and Air Conditioning. This is Aria, how can I help you today?";

/**
 * Generic front-desk pack for the 15+ non-trade verticals (dentist, law firm,
 * med spa, …). The trade packs talk about pipes and furnaces — wrong demo for
 * a dental office.
 */
function buildGenericDemo(client) {
  const name = client.business_name;
  const city = client.city || 'your area';
  const state = client.state || '';
  const systemPrompt = [
    `You are the AI receptionist for ${name}, serving ${city}${state ? ', ' + state : ''}.`,
    `Your job: answer inbound calls warmly and professionally, capture the caller's name and callback number, understand what they need, and take a clear message or note an appointment request.`,
    `Speak naturally and conversationally — you are a knowledgeable front-desk voice, not a script reader.`,
    `If the caller describes something urgent, acknowledge it, mark the message urgent, and assure them someone will call back promptly.`,
    `Do not quote prices, make scheduling commitments, or guarantee availability — the team will confirm when they follow up.`,
    `If the caller asks for a human or the owner, let them know someone will call them right back and capture their number.`,
  ].join(' ');
  return {
    version: 'generic-demo-v1',
    systemPrompt,
    greeting: `Thank you for calling ${name}! How can I help you today?`,
    tone: 'professional', doNotSay: [], escalationKeywords: [],
    afterHoursBehavior: 'voicemail', businessHours: {}, forwardToNumber: null, pricingNotes: '',
  };
}

/**
 * Pick a pack builder. Name inference FIRST: the clients schema defaults
 * business_type to 'plumbing' (NOT NULL DEFAULT), so every scraped lead —
 * dentists included — carries 'plumbing'. Only non-default type values
 * (hvac/combined, deliberately set via intake) are trusted as a fallback.
 */
function pickBuilder(lead) {
  const name = (lead.business_name || '').toLowerCase();
  const plumb = /plumb|drain|sewer|rooter|\bpipe/.test(name);
  const hvac  = /hvac|heat|\bair\b|cool|mechanical|furnace|a\/c|\bac\b|climate/.test(name);
  if (plumb && hvac) return buildCombinedV1;
  if (plumb) return buildPlumbingV1;
  if (hvac)  return buildHvacV1;
  if (lead.business_type === 'hvac')     return buildHvacV1;
  if (lead.business_type === 'combined') return buildCombinedV1;
  return buildGenericDemo;
}

async function ensureStateTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_line_state (
      id            INT PRIMARY KEY CHECK (id = 1),
      lead_id       UUID,
      business_name TEXT,
      is_default    BOOLEAN DEFAULT true,
      applied_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function saveState(pool, { leadId, businessName, isDefault }) {
  await pool.query(
    `INSERT INTO demo_line_state (id, lead_id, business_name, is_default, applied_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE
       SET lead_id=$1, business_name=$2, is_default=$3, applied_at=NOW()`,
    [leadId ?? null, businessName, isDefault]
  );
}

/**
 * Re-skin the demo line to answer as `lead`'s business.
 * @returns {{ number: string, packVersion: string, businessName: string, resetMinutes: number }}
 */
async function applyDemoPack(pool, lead, provider) {
  await ensureStateTable(pool);
  const pack = pickBuilder(lead)(lead);
  await provider.applyContentPack(DEMO_AGENT_ID, pack);
  await saveState(pool, { leadId: lead.id, businessName: lead.business_name, isDefault: false });
  return { number: DEMO_NUMBER, packVersion: pack.version, businessName: lead.business_name, resetMinutes: RESET_MINUTES };
}

/** Reset the demo line to the Murphy's default identity. */
async function resetDemoLine(pool, provider) {
  await ensureStateTable(pool);
  const pack = buildCombinedV1(MURPHY_DEFAULT);
  pack.greeting = MURPHY_GREETING; // preserve the line's original exact greeting
  await provider.applyContentPack(DEMO_AGENT_ID, pack);
  await saveState(pool, { leadId: null, businessName: MURPHY_DEFAULT.business_name, isDefault: true });
  return { number: DEMO_NUMBER, businessName: MURPHY_DEFAULT.business_name };
}

/**
 * Called by the sales worker every tick: if a demo pack has been live longer
 * than RESET_MINUTES, revert to default. Returns true if a reset happened.
 *
 * CLAIM-FIRST: atomically flip the state row before touching Trillet, so a
 * concurrent /demo (different process) can't be clobbered by a slow reset —
 * the conditional UPDATE only wins if the expired demo is still the current
 * state. A /demo landing after the claim simply overwrites flow + state (its
 * Trillet write comes later; last write wins). Residual race ≈ the seconds of
 * one Trillet round-trip, once per expiry.
 */
async function sweepDemoLine(pool, provider) {
  await ensureStateTable(pool);
  const { rows } = await pool.query(
    `UPDATE demo_line_state
       SET is_default=true, lead_id=NULL, business_name=$2, applied_at=NOW()
     WHERE id=1 AND is_default=false
       AND applied_at < NOW() - ($1 || ' minutes')::interval
     RETURNING id`,
    [RESET_MINUTES, MURPHY_DEFAULT.business_name]
  );
  if (!rows.length) return false;
  const pack = buildCombinedV1(MURPHY_DEFAULT);
  pack.greeting = MURPHY_GREETING;
  await provider.applyContentPack(DEMO_AGENT_ID, pack);
  return true;
}

module.exports = { applyDemoPack, resetDemoLine, sweepDemoLine, DEMO_NUMBER, DEMO_AGENT_ID };
