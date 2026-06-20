'use strict';
const { callClaudeAudited } = require('../lib/claude');

// Reference script and objection — update these when your real ones are validated.
const REFERENCE_SCRIPT = `[PLACEHOLDER — replace with your validated opening script]
Opening: "Hi [Name], quick question — when someone calls your business and you don't pick up, what happens?"
Transition: "We built an AI that catches those calls, qualifies them, and texts you the lead instantly. 24/7. Takes 10 minutes to set up. Two minutes to hear how it works?"`;

const MOCK_OBJECTION = `[PLACEHOLDER — replace with your most common real objection]
"We already have an answering service."`;

const SYSTEM = `You are a sales hiring expert evaluating a cold-call rep candidate for an AI SaaS company.
Score them on four dimensions. Be honest — false positives cost more than false negatives.

Return ONLY valid JSON (no markdown, no commentary):
{
  "score": <weighted 0-100>,
  "breakdown": {
    "clarity":             {"score": 0, "notes": ""},
    "pacing":              {"score": 0, "notes": ""},
    "objection_handling":  {"score": 0, "notes": ""},
    "script_adherence":    {"score": 0, "notes": ""}
  },
  "hire_recommendation": "strong_yes|yes|no|strong_no",
  "strengths":  [],
  "red_flags":  [],
  "reasoning":  "One paragraph for the hiring manager. Be specific about what you heard."
}`;

async function screenCandidate(pool, candidate) {
  const userPrompt = `REFERENCE SCRIPT:\n${REFERENCE_SCRIPT}\n\nMOCK OBJECTION GIVEN:\n${MOCK_OBJECTION}\n\nCANDIDATE TRANSCRIPT:\n${candidate.transcript || '(no transcript — score based on application text only)'}\n\nWRITTEN APPLICATION:\n${candidate.application_text || '(none)'}`;

  return callClaudeAudited({
    pool,
    entityType:   'candidate',
    entityId:     candidate.id,
    action:       'screened',
    dataSnapshot: { candidateId: candidate.id, hasTranscript: !!candidate.transcript },
    systemPrompt: SYSTEM,
    userPrompt,
    maxTokens:    1024,
  });
}

module.exports = { screenCandidate };
