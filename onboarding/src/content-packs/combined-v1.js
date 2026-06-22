'use strict';

const { formatHours, formatAfterHours } = require('./helpers');

/**
 * combined-v1 content pack — businesses that do both plumbing and HVAC.
 *
 * The agent identifies which trade the caller needs (or both) and responds
 * in the language of that trade. Three escalation tiers:
 *   Safety:          gas smell, CO — evacuate + 911 first, then transfer
 *   Plumbing urgent: burst pipe, flooding, sewage — transfer immediately
 *   HVAC urgent:     no heat, no AC — transfer immediately
 *
 * @param {object} client - row from the clients table
 * @returns {import('../../../voice-provider/src/interface').ContentPack}
 */
function buildCombinedV1(client) {
  const name       = client.business_name;
  const services   = (client.services_offered || []).join(', ') || 'plumbing and HVAC services';
  const city       = client.city  || 'your area';
  const state      = client.state || '';
  const doNotSay   = client.do_not_say          || [];
  const escalation = client.escalation_keywords || [
    // Safety (both trades) — highest tier
    'gas smell', 'smell gas', 'smell like gas', 'gas leak',
    'carbon monoxide', 'CO alarm', 'CO detector', 'carbon monoxide alarm', 'CO is going off',
    // Plumbing urgent
    'burst pipe', 'pipe burst', 'flooding', 'flood', 'sewage backup', 'sewage overflow',
    'sewage coming up', 'sewer backup', 'major leak', 'water everywhere',
    // HVAC urgent
    'no heat', 'no heating', 'heat not working', 'furnace not working',
    "furnace won't turn on", 'furnace went out', 'furnace not igniting',
    'no AC', 'no air conditioning', 'no cooling', 'AC not working', 'AC went out',
    'air conditioner not working',
  ];
  const tone     = client.tone                 || 'professional';
  const afterHrs = client.after_hours_behavior || 'voicemail';
  const forward  = client.forward_to_number;
  const pricing  = client.pricing_notes        || '';
  const hours    = client.business_hours        || {};

  const hoursText = formatHours(hours);
  const afterText = formatAfterHours(afterHrs, forward);
  const xfer      = forward
    ? `transfer the call to ${forward}`
    : "let them know you're getting someone on the line immediately and take their number";

  const systemPrompt = [
    `You are the AI receptionist for ${name}, serving ${city}${state ? ', ' + state : ''} for both plumbing and HVAC needs.`,
    `Your job: answer inbound calls warmly, identify whether the caller has a plumbing issue, an HVAC issue, or both, capture their name and callback number, and route or take a message appropriately.`,
    `Services: ${services}.`,
    hoursText ? `Business hours: ${hoursText}. ${afterText}` : afterText,
    `Tone: ${tone}. Speak naturally and conversationally — you are a knowledgeable front-desk voice, not a script reader.`,
    `Listen to identify the trade: plumbing issues involve pipes, drains, water heaters, leaks, or sewage; HVAC issues involve heating, cooling, furnaces, air conditioners, ductwork, or thermostats. Respond in the language of whichever trade applies — or both if the caller has issues in both. Ask a couple of natural triage questions to help the technician prepare, but keep it conversational.`,
    pricing
      ? `Pricing context (never quote exact prices or make guarantees): ${pricing}. Tell callers the team will confirm pricing when they follow up.`
      : `Do not quote prices or make pricing commitments. Tell callers the team will confirm costs when they schedule.`,
    doNotSay.length ? `Never say or imply: ${doNotSay.join('; ')}.` : '',
    `Life-safety emergencies — highest priority: if the caller mentions gas smell, smell gas, gas leak, carbon monoxide, CO alarm, or CO detector going off — tell them clearly: leave the building now if they smell gas or CO is alarming, call 911 if they haven't, and then ${xfer}.`,
    `Urgent plumbing emergencies: burst pipe, flooding, sewage backup, major leak, water everywhere — treat as urgent, acknowledge the severity, and ${xfer}.`,
    `Urgent HVAC emergencies: no heat, furnace not working or went out, no AC or cooling in extreme heat — treat as urgent and ${xfer}.`,
    `If the caller asks to speak with a human or the owner, ${forward ? `transfer them to ${forward}` : "let them know someone will call them right back and take their number"}.`,
    `Do not make scheduling commitments or guarantee availability. Capture name and callback number for every caller.`,
  ].filter(Boolean).join(' ');

  return {
    version:            'combined-v1',
    systemPrompt,
    greeting:           `Thank you for calling ${name}! How can I help you today?`,
    tone,
    doNotSay,
    escalationKeywords: escalation,
    afterHoursBehavior: afterHrs,
    businessHours:      hours,
    forwardToNumber:    forward,
    pricingNotes:       pricing,
  };
}

module.exports = { buildCombinedV1 };
