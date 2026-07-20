'use strict';

/**
 * Extract structured outcome data from a sales-call transcript using Claude.
 * Emits ONLY the enum values the call_outcomes table + /insights aggregation
 * expect, so auto-extracted data drops into the exact same place the manual
 * /call survey writes — no /insights changes needed.
 *
 * NOTE: closes are NEVER trusted from here for pay — the authoritative close
 * count comes from Stripe. 'outcome' here is a qualitative signal only (same as
 * the /call "Closed" tap), used for the demo-method / objection breakdowns.
 */

const { callClaude } = require('../lib/claude');

// These MUST match the values buildInsights() in the Telegram webhook aggregates.
const OUTCOMES   = ['closed', 'interested_followup', 'callback_scheduled', 'demo_given_no_close', 'not_interested', 'no_answer_voicemail'];
const OBJECTIONS = ['price', 'setup_fee', 'dont_trust_ai', 'too_busy', 'already_have_solution', 'not_decision_maker', 'no_need', 'other', 'none'];
const DEMOS      = ['live_conference', 'recording', 'call_back_themselves', 'none'];
const WHO        = ['owner', 'gatekeeper', 'voicemail', 'unknown'];
const HEARD      = ['yes', 'no', 'unknown'];

const SYSTEM = `You analyze ONE sales-call transcript for an AI phone-receptionist SaaS and extract structured outcome data. Return ONLY valid JSON, no markdown:
{
  "outcome": one of ${JSON.stringify(OUTCOMES)},
  "primary_objection": one of ${JSON.stringify(OBJECTIONS)} — the main reason they hesitated; "none" if they didn't object,
  "demo_method": one of ${JSON.stringify(DEMOS)} — how a demo was delivered if any; "none" if no demo,
  "who_answered": one of ${JSON.stringify(WHO)} — "owner" if the decision-maker answered, "gatekeeper" if staff/receptionist, "voicemail" if a machine, "unknown" if indeterminable,
  "heard_ai_before": one of ${JSON.stringify(HEARD)} — did the prospect indicate they'd been pitched AI phone answering before? "unknown" if it never came up,
  "summary": one short sentence, max 20 words, of what happened.
}
Rules:
- Base every field strictly on the transcript; quote nothing, infer little.
- "closed" means the prospect actually agreed to pay/sign up ON the call — not mere interest. When unsure, prefer "interested_followup".
- Use EXACTLY the allowed string values, lowercase, no extra fields.`;

function coerce(v, allowed, fallback) { return allowed.includes(v) ? v : fallback; }

/**
 * @param {string} transcript  plain-text transcript (use justcall.transcriptToText)
 * @param {{ summary?: string }} [opts]
 * @returns {Promise<{outcome:string, primary_objection:string, demo_method:string, summary:string}>}
 */
async function extractCallData(transcript, { summary } = {}) {
  if (!transcript || !transcript.trim()) throw new Error('extractCallData: empty transcript');

  const userPrompt = `${summary ? `Provider's own summary: ${summary}\n\n` : ''}TRANSCRIPT:\n${transcript}`;
  const raw = await callClaude({ systemPrompt: SYSTEM, userPrompt, maxTokens: 400 });

  let parsed;
  try { parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()); }
  catch { throw new Error('extractCallData: model did not return JSON: ' + raw.slice(0, 150)); }

  return {
    outcome:           coerce(parsed.outcome,           OUTCOMES,   'interested_followup'),
    primary_objection: coerce(parsed.primary_objection, OBJECTIONS, 'none'),
    demo_method:       coerce(parsed.demo_method,       DEMOS,      'none'),
    who_answered:      coerce(parsed.who_answered,      WHO,        'unknown'),
    heard_ai_before:   coerce(parsed.heard_ai_before,   HEARD,      'unknown'),
    summary:           String(parsed.summary || '').slice(0, 200),
  };
}

module.exports = { extractCallData, OUTCOMES, OBJECTIONS, DEMOS, WHO, HEARD };
