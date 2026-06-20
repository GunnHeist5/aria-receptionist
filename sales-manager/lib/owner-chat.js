'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const client     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_HIST   = 20;
// In-memory history — persists for the life of the aria-web process
const history    = [];

async function getContext(pool) {
  const [reps, pipeline, mrrRow, owedRow] = await Promise.all([
    pool.query(`
      SELECT c.name,
        (SELECT health_status FROM rep_metrics WHERE contractor_id=c.id ORDER BY computed_at DESC LIMIT 1) AS health,
        c.onboarding_step,
        c.last_active_at
      FROM contractors c WHERE c.active=true AND c.contract_signed_at IS NOT NULL
    `),
    pool.query(`SELECT status, COUNT(*) AS n FROM candidates GROUP BY status`),
    pool.query(`SELECT COALESCE(SUM(mrr),0) AS total FROM clients WHERE billing_status='active'`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS owed FROM commissions WHERE status='accrued'`),
  ]);

  const repLines = reps.rows.length
    ? reps.rows.map(r => `  • ${r.name} — ${r.health ?? 'no data'}, last active ${r.last_active_at ? new Date(r.last_active_at).toDateString() : 'never'}`).join('\n')
    : '  (none yet)';

  const pipelineLines = pipeline.rows.length
    ? pipeline.rows.map(r => `  ${r.status}: ${r.n}`).join('\n')
    : '  (none)';

  return `REACHWELL — LIVE SNAPSHOT
Active reps:
${repLines}

Candidate pipeline:
${pipelineLines}

MRR: $${Number(mrrRow.rows[0]?.total ?? 0).toFixed(0)}/mo
Commissions owed to reps: $${Number(owedRow.rows[0]?.owed ?? 0).toFixed(2)}`;
}

async function chat(pool, userMessage) {
  const context = await getContext(pool);

  const systemPrompt = `You are the Reachwell business assistant — a sharp, concise advisor to the founder.

${context}

About Reachwell: AI phone receptionists for local service businesses (HVAC, plumbers, etc). $297/mo + $500 setup. Early stage — closing first clients now. Sales reps are 1099 contractors who cold call; commission-only.

You can discuss strategy, rep performance, script ideas, pricing, candidate evaluation, market positioning, objection handling — anything about the business. Be direct and specific. This is Telegram, so keep replies short unless asked for detail. Use the live data above when relevant.`;

  history.push({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   history.slice(-MAX_HIST),
  });

  const reply = response.content[0]?.text ?? '(no response)';
  history.push({ role: 'assistant', content: reply });

  // Keep history bounded
  if (history.length > MAX_HIST) history.splice(0, history.length - MAX_HIST);

  return reply;
}

module.exports = { chat };
