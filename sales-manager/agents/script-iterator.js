'use strict';
const { callClaude } = require('../lib/claude');

const SYSTEM = `You are a sales script analyst for Reachwell, which sells AI phone receptionists to local service businesses (HVAC, plumbers, contractors).

Your job: analyze a week's worth of objections logged by cold-callers, identify the top patterns, and suggest concrete script improvements.

Be specific. Quote the objection. Give the suggested rebuttal verbatim. Don't be generic.

Return ONLY valid JSON:
{
  "top_objections": [
    { "objection": "...", "frequency": N, "pattern": "...", "suggested_rebuttal": "..." }
  ],
  "script_update_suggestion": "The full revised opening/objection section to replace in the script. Write it as the rep would actually say it.",
  "summary_for_owner": "2-3 sentence plain English summary of what you found and what changed."
}`;

async function analyzeObjections(pool) {
  const { rows: objections } = await pool.query(`
    SELECT o.description, c.name AS rep_name
    FROM objections o
    LEFT JOIN contractors c ON c.id = o.contractor_id
    WHERE o.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY o.created_at DESC
    LIMIT 100
  `);

  if (objections.length === 0) return null;

  const objectionList = objections
    .map((o, i) => `${i + 1}. [${o.rep_name ?? 'unknown'}] "${o.description}"`)
    .join('\n');

  const raw = await callClaude({
    systemPrompt: SYSTEM,
    userPrompt:   `OBJECTIONS THIS WEEK (${objections.length} total):\n${objectionList}`,
    maxTokens:    1500,
  });

  try {
    const cleaned = raw.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { summary_for_owner: raw, top_objections: [], script_update_suggestion: null };
  }
}

async function runScriptLoop(pool, sendToOwner, approvalKeyboard) {
  const result = await analyzeObjections(pool);
  if (!result) return; // no objections this week

  const { rows: [proposal] } = await pool.query(
    `INSERT INTO script_proposals (week_start, top_objections, proposed_script_update, status)
     VALUES (DATE_TRUNC('week', NOW())::date, $1, $2, 'pending') RETURNING id`,
    [JSON.stringify(result.top_objections), result.script_update_suggestion]
  );

  const topList = (result.top_objections ?? [])
    .slice(0, 3)
    .map((o: any, i: number) => `${i + 1}. "${o.objection}" (×${o.frequency})\n   → ${o.suggested_rebuttal}`)
    .join('\n\n');

  const msg = `📋 <b>Weekly Script Loop</b>\n\n${result.summary_for_owner}\n\n<b>Top objections + suggested rebuttals:</b>\n\n${topList}\n\nApprove to push the script update to all reps' KB. Deny to skip.`;

  await sendToOwner(msg, approvalKeyboard('script', proposal.id));
}

module.exports = { runScriptLoop, analyzeObjections };
