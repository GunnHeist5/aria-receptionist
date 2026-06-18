'use strict';

/**
 * plumbing-v1 content pack.
 *
 * Builds a ContentPack from a `clients` row. All fields come from the DB so
 * this works for any plumbing client regardless of whether they have a website.
 *
 * @param {object} client - row from the clients table
 * @returns {import('../../../voice-provider/src/interface').ContentPack}
 */
function buildPlumbingV1(client) {
  const name         = client.business_name;
  const services     = (client.services_offered || []).join(', ') || 'general plumbing services';
  const city         = client.city  || 'your area';
  const state        = client.state || '';
  const doNotSay     = client.do_not_say           || [];
  const escalation   = client.escalation_keywords  || ['burst pipe', 'flooding', 'gas leak', 'sewage backup'];
  const tone         = client.tone                 || 'professional';
  const afterHours   = client.after_hours_behavior || 'voicemail';
  const forward      = client.forward_to_number;
  const pricing      = client.pricing_notes        || '';
  const hours        = client.business_hours       || {};

  const hoursText    = formatHours(hours);
  const afterText    = formatAfterHours(afterHours, forward);

  const systemPrompt = [
    `You are the AI receptionist for ${name}, a plumbing company serving ${city}${state ? ', ' + state : ''}.`,
    `Your job: answer inbound calls warmly, understand the caller's plumbing need, capture their name and callback number, and route or take a message appropriately.`,
    `Services offered: ${services}.`,
    hoursText ? `Business hours: ${hoursText}. ${afterText}` : afterText,
    `Tone: ${tone}. Speak naturally and conversationally — you are a helpful front-desk voice, not a robot.`,
    pricing
      ? `Pricing guidance for context only (do not quote exact prices or make guarantees): ${pricing}. Always tell callers the team will confirm pricing when they follow up.`
      : `Do not quote prices or make pricing commitments. Tell callers the team will confirm costs when they call back.`,
    doNotSay.length
      ? `Never say or imply: ${doNotSay.join('; ')}.`
      : '',
    `Emergency escalation: if the caller mentions ${escalation.join(', ')} — treat it as urgent. Acknowledge the severity, reassure them help is on the way, and${forward ? ` transfer immediately to ${forward}` : ' ask them to hold while you connect them'}.`,
    `If the caller asks to speak with a human or the owner, ${forward ? `transfer them to ${forward}` : 'let them know you will have someone call them right back and take their number'}.`,
    `Do not make scheduling commitments or guarantee availability. Capture name + callback number for every caller.`,
  ].filter(Boolean).join(' ');

  return {
    version:            'plumbing-v1',
    systemPrompt,
    greeting:           `Thank you for calling ${name}! How can I help you today?`,
    tone,
    doNotSay,
    escalationKeywords: escalation,
    afterHoursBehavior: afterHours,
    businessHours:      hours,
    forwardToNumber:    forward,
    pricingNotes:       pricing,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = {
  'mon':     'Monday',
  'tue':     'Tuesday',
  'wed':     'Wednesday',
  'thu':     'Thursday',
  'fri':     'Friday',
  'sat':     'Saturday',
  'sun':     'Sunday',
  'mon-fri': 'Monday through Friday',
  'mon-sat': 'Monday through Saturday',
  'mon-sun': 'Monday through Sunday (every day)',
};

function formatTime(t) {
  // "08:00" → "8:00 AM", "17:00" → "5:00 PM"
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function formatHours(hours) {
  if (!hours || !Object.keys(hours).length) return '';
  return Object.entries(hours)
    .map(([days, range]) => {
      const label = DAY_LABELS[days] || days;
      const [start, end] = range.split('-');
      return `${label} ${formatTime(start)}–${formatTime(end)}`;
    })
    .join(', ');
}

function formatAfterHours(behavior, forward) {
  switch (behavior) {
    case 'forward':
      return forward
        ? `Outside business hours, calls are still forwarded to ${forward} — the owner handles after-hours calls directly.`
        : 'Outside business hours, try to reach someone on the team.';
    case 'emergency_only':
      return 'Outside business hours, only handle genuine emergencies. For non-emergencies, take the caller\'s name and number and let them know the team will call back next business day.';
    case 'ai_message':
      return 'Outside business hours, let the caller know the office is closed, take their name and number, and assure them someone will follow up promptly.';
    case 'voicemail':
    default:
      return 'Outside business hours, take a message — get their name, number, and nature of the issue, and assure them someone will call back as soon as possible.';
  }
}

module.exports = { buildPlumbingV1 };
