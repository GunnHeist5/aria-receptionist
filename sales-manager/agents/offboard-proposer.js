'use strict';
const { callClaudeAudited } = require('../lib/claude');

const SYSTEM = `You are a fair, humane sales manager deciding whether to offboard a commission-only contractor.
Your threshold is HIGH. You are NOT trigger-happy. People get sick. Emergencies happen. Holidays exist.
Only propose offboarding when: (1) inactivity is sustained and significant, AND (2) re-engagement has been genuinely attempted and ignored.
If there is any reasonable doubt, recommend continue_monitoring or escalate_to_human.

Return ONLY valid JSON:
{
  "recommendation": "offboard|continue_monitoring|escalate_to_human",
  "confidence": 0.0,
  "reasoning": "Full explanation for the human. What data you saw. What you tried. Why you're recommending this.",
  "mitigating_factors": [],
  "risk_factors": [],
  "proposed_offboarding_message": "Message to send the rep IF offboarding is approved. Respectful. Acknowledges their effort. Not robotic.",
  "proposed_telegram_to_owner": "Short 2-3 sentence summary for the Telegram notification"
}`;

async function analyzeForOffboarding(pool, rep, activityTimeline, communications, reEngagementLog) {
  const daysSilent = Math.floor(
    (Date.now() - new Date(rep.last_active_at ?? rep.created_at).getTime()) / 86_400_000
  );

  const userPrompt = `REP: ${rep.name}
Joined: ${new Date(rep.created_at).toDateString()}
Days since last logged activity: ${daysSilent}
Re-engagement attempts made: ${reEngagementLog.length}

ACTIVITY — LAST 60 DAYS (by week):
${activityTimeline.length
  ? activityTimeline.map(w => `Week of ${w.week_start}: ${w.dials} dials, ${w.closes} closes`).join('\n')
  : 'No activity recorded.'}

INBOUND MESSAGES FROM REP:
${communications.length
  ? communications.map(m => `[${m.date}] "${m.message}"`).join('\n')
  : 'None.'}

RE-ENGAGEMENT ATTEMPTS BY MANAGER:
${reEngagementLog.length
  ? reEngagementLog.map(a => `[${a.date}] Sent: "${a.message_sent}" | Response: ${a.response ?? 'No response'}`).join('\n')
  : 'None yet.'}`;

  return callClaudeAudited({
    pool,
    entityType:   'contractor',
    entityId:     rep.id,
    action:       'offboarding_analyzed',
    dataSnapshot: { daysSilent, reEngagementAttempts: reEngagementLog.length },
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens:    1200,
  });
}

module.exports = { analyzeForOffboarding };
