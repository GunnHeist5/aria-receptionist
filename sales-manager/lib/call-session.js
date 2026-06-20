'use strict';

// In-memory call logging sessions: chatId → { step, outcome, primary_objection, demo_method }
const sessions = new Map();

// ── Enums (edit labels/values here to update the bot buttons) ──────────────

const OUTCOMES = [
  { label: '✅ Closed',         value: 'closed' },
  { label: '🔥 Interested',     value: 'interested_followup' },
  { label: '📅 Callback',       value: 'callback_scheduled' },
  { label: '🎯 Demo, no close', value: 'demo_given_no_close' },
  { label: '👎 Not interested', value: 'not_interested' },
  { label: '📵 No answer',      value: 'no_answer_voicemail' },
];

const OBJECTIONS = [
  { label: '💰 Price',             value: 'price' },
  { label: '💵 Setup fee',         value: 'setup_fee' },
  { label: "🤖 Don't trust AI",   value: 'dont_trust_ai' },
  { label: '⏰ Too busy',          value: 'too_busy' },
  { label: '🔄 Have solution',     value: 'already_have_solution' },
  { label: '👥 Not DM',           value: 'not_decision_maker' },
  { label: '🚫 No need',          value: 'no_need' },
  { label: '❓ Other',            value: 'other' },
  { label: '— None',              value: 'none' },
];

const DEMO_METHODS = [
  { label: '🔴 Live/conference', value: 'live_conference' },
  { label: '▶️ Recording',       value: 'recording' },
  { label: '📞 They call back',  value: 'call_back_themselves' },
  { label: '— None',             value: 'none' },
];

// ── Keyboard builders ──────────────────────────────────────────────────────

function makeRows(items, field, cols) {
  const rows = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols).map(item => ({
      text:          item.label,
      callback_data: `call:${field}:${item.value}`,
    })));
  }
  return { inline_keyboard: rows };
}

const outcomeKeyboard    = () => makeRows(OUTCOMES,     'outcome',    3);
const objectionKeyboard  = () => makeRows(OBJECTIONS,   'objection',  3);
const demoKeyboard       = () => makeRows(DEMO_METHODS, 'demo',       2);
const noteKeyboard       = () => ({ inline_keyboard: [[{ text: 'Skip →', callback_data: 'call:note:skip' }]] });

// ── Session helpers ────────────────────────────────────────────────────────

const get   = chatId => sessions.get(String(chatId)) ?? null;
const set   = (chatId, state) => sessions.set(String(chatId), state);
const clear = chatId => sessions.delete(String(chatId));

module.exports = {
  get, set, clear,
  outcomeKeyboard, objectionKeyboard, demoKeyboard, noteKeyboard,
  OUTCOMES, OBJECTIONS, DEMO_METHODS,
};
