'use strict';
const Anthropic = require('@anthropic-ai/sdk');

// Lazy init — must not throw at import time (e.g. during `next build`); the key
// is only required the first time Claude is actually called at runtime.
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

async function callClaude({ systemPrompt, userPrompt, model = 'claude-haiku-4-5-20251001', maxTokens = 2048 }) {
  const msg = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return msg.content[0].text;
}

// Calls Claude, parses JSON response, writes to audit_log, returns parsed result.
async function callClaudeAudited({ pool, entityType, entityId, action, dataSnapshot, systemPrompt, userPrompt, model, maxTokens }) {
  const raw = await callClaude({ systemPrompt, userPrompt, model, maxTokens });

  let parsed = null;
  let reasoning = raw;
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
    reasoning = parsed.reasoning ?? parsed.internal_notes ?? raw.slice(0, 500);
  } catch { /* response wasn't JSON — store raw */ }

  await pool.query(
    `INSERT INTO audit_log (entity_type, entity_id, action, data_snapshot, llm_reasoning, outcome)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId ?? null, action,
     JSON.stringify(dataSnapshot ?? {}), reasoning,
     JSON.stringify(parsed ?? { raw })]
  );

  return parsed ?? raw;
}

module.exports = { callClaude, callClaudeAudited };
