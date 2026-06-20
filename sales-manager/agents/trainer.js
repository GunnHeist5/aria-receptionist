'use strict';
const { callClaude } = require('../lib/claude');
const kb = require('../lib/knowledge-base');

const SYSTEM = (rep) => `You are Aria, the internal assistant for Reachwell sales reps.
You answer questions about the product, the sales script, objection handling, lead lists, commissions, and technical setup.
Be conversational, specific, and encouraging. Keep answers under 200 words unless more is truly needed.
Rep name: ${rep.name}. Onboarding status: ${rep.onboarding_status}.
If you don't know something, say so clearly and tell them to ask their manager.
Never mention Trillet, our internal systems, or other reps.`;

async function answerQuestion(pool, contractor, question) {
  const entries  = await kb.search(pool, question);
  const context  = kb.toPromptContext(entries);
  const answer   = await callClaude({
    systemPrompt: SYSTEM(contractor),
    userPrompt:   `KNOWLEDGE BASE:\n${context}\n\nREP QUESTION:\n${question}`,
    maxTokens:    512,
  });

  await pool.query(
    `INSERT INTO coaching_sessions
       (contractor_id, trigger, input_snapshot, coaching_content, action_taken, sent_at)
     VALUES ($1, 'question', $2, $3, 'answered', NOW())`,
    [contractor.id, JSON.stringify({ question, kbHits: entries.length }), answer]
  );

  return answer;
}

module.exports = { answerQuestion };
