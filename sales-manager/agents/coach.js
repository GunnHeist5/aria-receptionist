'use strict';
const { callClaudeAudited } = require('../lib/claude');

const SYSTEM = `You are an experienced sales manager coaching a commission-only cold-caller selling AI software to plumbers and HVAC companies.
Be specific, direct, and human — not corporate. Use their actual numbers. Distinguish between skill gaps, effort issues, lead quality problems, and script problems using the data.
Tone: like a manager who genuinely wants them to win, not a bot.

Return ONLY valid JSON:
{
  "diagnosis": "skill_gap|effort_gap|lead_quality|script_issue|on_track|disengaged",
  "confidence": 0.0,
  "coaching_message": "The actual message to send to the rep. Use their name. Keep under 200 words.",
  "internal_notes": "Your private reasoning — NOT sent to the rep. What you think is really going on.",
  "action": "send_coaching|flag_for_review|escalate_to_human|no_action",
  "urgency": "routine|elevated|urgent"
}`;

async function coachRep(pool, rep, metrics7d, metrics30d, peerMedian, recentSessions) {
  const connectRate7d = metrics7d.total_dials > 0
    ? ((metrics7d.total_connects / metrics7d.total_dials) * 100).toFixed(1) : 'n/a';
  const closeRate7d = metrics7d.total_demos > 0
    ? ((metrics7d.total_closes / metrics7d.total_demos) * 100).toFixed(1) : 'n/a';

  const userPrompt = `REP: ${rep.name} (active ${rep.weeks_active ?? '?'} weeks | commission: $${rep.commission_setup} setup + ${rep.commission_residual_pct}% residual)

7-DAY ACTIVITY:
  Dials: ${metrics7d.total_dials ?? 0} (team median: ${peerMedian.median_dials ?? 'n/a'})
  Connects: ${metrics7d.total_connects ?? 0} | Connect rate: ${connectRate7d}%
  Demos: ${metrics7d.total_demos ?? 0}
  Closes: ${metrics7d.total_closes ?? 0} | Demo-to-close: ${closeRate7d}%
  Health flag: ${metrics7d.health_status ?? 'unknown'}

30-DAY TOTALS:
  Dials: ${metrics30d.total_dials ?? 0} | Closes: ${metrics30d.total_closes ?? 0}
  MRR generated: $${metrics30d.mrr_generated ?? 0}

PREVIOUS COACHING (last 3 — do not repeat the same advice):
${recentSessions.length
  ? recentSessions.map(s => `[${s.created_at?.toISOString?.()?.slice(0,10)}] ${s.diagnosis}: "${s.coaching_content?.slice(0,120)}..."`).join('\n')
  : 'None yet.'}`;

  return callClaudeAudited({
    pool,
    entityType:   'contractor',
    entityId:     rep.id,
    action:       'coached',
    dataSnapshot: { metrics7d, peerMedian },
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens:    1024,
  });
}

module.exports = { coachRep };
