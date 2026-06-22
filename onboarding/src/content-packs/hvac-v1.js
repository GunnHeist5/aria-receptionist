'use strict';

const { formatHours, formatAfterHours } = require('./helpers');

/**
 * hvac-v1 content pack.
 *
 * Two-tier escalation model:
 *   Safety (highest): gas smell, CO — advise evacuation + 911 before transferring
 *   Comfort/urgent:   no heat, no AC, furnace failure — transfer immediately
 *
 * @param {object} client - row from the clients table
 * @returns {import('../../../voice-provider/src/interface').ContentPack}
 */
function buildHvacV1(client) {
  const name       = client.business_name;
  const services   = (client.services_offered || []).join(', ') || 'heating, cooling, and HVAC services';
  const city       = client.city  || 'your area';
  const state      = client.state || '';
  const doNotSay   = client.do_not_say          || [];
  const escalation = client.escalation_keywords || [
    // Comfort/urgent — transfer immediately
    'no heat', 'no heating', 'heat not working', 'heater not working',
    "furnace won't turn on", 'furnace not working', 'furnace not igniting', 'furnace went out',
    'no AC', 'no air conditioning', 'no cooling', 'AC not working', 'AC went out',
    'air conditioner not working', 'air conditioner stopped',
    // Safety — evacuate + 911 guidance first
    'gas smell', 'smell gas', 'smell like gas', 'gas leak',
    'carbon monoxide', 'CO alarm', 'CO detector', 'carbon monoxide alarm', 'CO is going off',
  ];
  const tone     = client.tone                 || 'professional';
  const afterHrs = client.after_hours_behavior || 'voicemail';
  const forward  = client.forward_to_number;
  const pricing  = client.pricing_notes        || '';
  const hours    = client.business_hours        || {};

  const hoursText     = formatHours(hours);
  const afterText     = formatAfterHours(afterHrs, forward);
  const xfer          = forward
    ? `transfer the call to ${forward}`
    : "let them know you're getting someone on the line immediately and take their number";

  // Safety keywords get separate guidance (evacuate/911 first)
  const safetyKws  = ['gas smell', 'smell gas', 'smell like gas', 'gas leak',
                      'carbon monoxide', 'CO alarm', 'CO detector', 'carbon monoxide alarm', 'CO is going off'];
  const comfortKws = escalation.filter(k => !safetyKws.includes(k));

  const systemPrompt = [
    `You are the AI receptionist for ${name}, an HVAC company serving ${city}${state ? ', ' + state : ''}.`,
    `Your job: answer inbound calls warmly, understand the caller's heating or cooling situation, capture their name and callback number, and route or take a message appropriately.`,
    `Services: ${services}.`,
    hoursText ? `Business hours: ${hoursText}. ${afterText}` : afterText,
    `Tone: ${tone}. Speak naturally and conversationally — you are a knowledgeable front-desk voice, not a script reader.`,
    `When a caller describes their issue, ask a couple of natural triage questions — is it a heating or cooling problem, is the system running at all, roughly how old the unit is — but keep it brief and conversational, not an interrogation. This helps the technician arrive prepared.`,
    pricing
      ? `Pricing context (never quote exact prices or make guarantees): ${pricing}. Always tell callers the team will confirm pricing when they follow up.`
      : `Do not quote prices or make pricing commitments. Tell callers the team will confirm costs when they schedule.`,
    doNotSay.length ? `Never say or imply: ${doNotSay.join('; ')}.` : '',
    safetyKws.length
      ? `Life-safety emergencies — highest priority: if the caller mentions ${safetyKws.join(', ')} — this is a safety situation, not just a comfort issue. Tell them clearly: if they smell gas or CO is going off, they should leave the building now and call 911 if they haven't. Then ${xfer}.`
      : '',
    comfortKws.length
      ? `Urgent comfort situations: if the caller mentions ${comfortKws.join(', ')} — acknowledge the difficulty, reassure them the team will prioritize them, and ${xfer}.`
      : '',
    `If the caller asks to speak with a human or the owner, ${forward ? `transfer them to ${forward}` : "let them know someone will call them right back and take their number"}.`,
    `Do not make scheduling commitments or guarantee same-day service. Capture name and callback number for every caller.`,
  ].filter(Boolean).join(' ');

  return {
    version:            'hvac-v1',
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

module.exports = { buildHvacV1 };
