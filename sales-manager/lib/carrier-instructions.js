'use strict';

/**
 * Carrier call-forwarding instruction library.
 *
 * CRITICAL: every star-code here activates CONDITIONAL (no-answer) forwarding —
 * the business phone rings first and only unanswered calls go to the AI.
 * *72 (unconditional/forward-all) is never used here; that would bypass the owner's phone entirely.
 *
 * Each entry:
 *   name        — display label for dropdowns
 *   confidence  — 'high' = carrier-confirmed or verified on a real line
 *                 'medium' = code is documented but needs real-line verification before trusting at scale
 *   sms(aiNumber, businessName) — copy-paste SMS body to send the client
 *
 * TO UPDATE A CARRIER: edit its sms() function.
 * aiNumber is E.164 (e.g. +12155551234). Use d10(n) for 10-digit form, fmt(n) for (XXX) XXX-XXXX.
 * After verifying on a real line, upgrade confidence from 'medium' to 'high' and remove the ⚠️ comment.
 */

const d10  = n => String(n).replace(/\D/g, '').slice(-10);
const fmt  = n => { const d = d10(n); return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; };
const sign = '— Justin';

// Universal troubleshooting lines appended to every star-code SMS.
const testNote = ai => [
  ``,
  `Two things before you text me back:`,
  `• Test by calling your business number from a DIFFERENT phone — calling from your own line can bypass forwarding and make it look broken.`,
  `• If the code doesn't work: try the same code but enter just the 10-digit number with no leading 1 and no dashes. Or call your carrier at 611 and ask them to enable "no-answer call forwarding to ${fmt(ai)}."`,
].join('\n');

// Universal note for portal-only carriers.
const portalTestNote = ai => [
  ``,
  `Two things before you text me back:`,
  `• Test by calling your business number from a DIFFERENT phone — calling from your own line can bypass forwarding and make it look broken.`,
  `• If calls still aren't going to the AI: confirm the rule is enabled (not just saved) and that a ring timeout/delay is configured. Or call your carrier and ask for "no-answer call forwarding to ${fmt(ai)}."`,
].join('\n');

// ─── Carrier library ──────────────────────────────────────────────────────────

const CARRIERS = {

  // ── WIRELESS ───────────────────────────────────────────────────────────────

  verizon: {
    name: 'Verizon Wireless',
    confidence: 'high',
    // *71 = Verizon no-answer conditional forward. *72 = unconditional (NOT used).
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type *71${d10(ai)} and press Call`,
      `3. You'll hear a confirmation tone, then hang up`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  att: {
    name: 'AT&T Wireless',
    confidence: 'high',
    // *61 = AT&T GSM no-answer conditional forward. *21 = unconditional (NOT used).
    // Fallback: try *61*${d10}# without the +1 if +1 format fails.
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type *61*+1${d10(ai)}# and press Call`,
      `3. You'll hear a success message, then hang up`,
      ``,
      `(If step 2 fails, try *61*${d10(ai)}# without the +1.)`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  tmobile: {
    name: 'T-Mobile / Sprint',
    confidence: 'high',
    // **61 = T-Mobile no-answer conditional forward with delay. **21 = unconditional (NOT used).
    // Fallback: try **61*${d10}**20# without the +1.
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings first (for 20 seconds), and only missed calls go to the AI.`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type **61*+1${d10(ai)}**20# and press Call`,
      `3. You'll hear a confirmation, then hang up`,
      ``,
      `(If step 2 fails, try **61*${d10(ai)}**20# without the +1.)`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  uscellular: {
    name: 'US Cellular',
    confidence: 'high',
    // *92 = US Cellular no-answer conditional forward. Confirmed — US Cellular does NOT support *71.
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type *92${d10(ai)} and press Call`,
      `3. You'll hear a confirmation, then hang up`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  // ── RESIDENTIAL / CABLE VOICE ──────────────────────────────────────────────

  xfinity: {
    name: 'Xfinity Voice (Residential)',
    confidence: 'medium',
    // *92 = Xfinity Voice no-answer conditional forward.
    // IMPORTANT: *71 and *72 on Xfinity are unconditional (forward-all) — do NOT use them.
    // ⚠️ MEDIUM CONFIDENCE — *92 is documented but verify on a real Xfinity residential line.
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      `(Do NOT use *71 or *72 on Xfinity — those forward ALL calls and your phone will stop ringing.)`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Pick up your home/office phone`,
      `2. Dial *92${d10(ai)} and press Call (or just wait)`,
      `3. You'll hear a confirmation, then hang up`,
      ``,
      `If *92 doesn't work, set it through the portal:`,
      `1. Go to xfinity.com → My Account → Voice → Call Forwarding`,
      `2. Enable "No Answer" forwarding and enter: ${fmt(ai)}`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  comcast_business: {
    name: 'Comcast Business (VoiceEdge)',
    confidence: 'high',
    // Portal only — VoiceEdge does not use the same star codes as residential Xfinity.
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Comcast Business VoiceEdge uses the online portal (no star codes). Takes about 3 minutes:`,
      ``,
      `1. Go to business.comcast.com and log in`,
      `2. Go to My Account → Business VoiceEdge → Call Forwarding`,
      `3. Select "No Answer" (not "Always Forward" — that bypasses your phone entirely)`,
      `4. Enter: ${fmt(ai)}`,
      `5. Save — you're done!`,
      portalTestNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — *92 documented for no-answer; portal may need to activate
  // the feature before the star code works. Verify on a real Spectrum Business line.
  spectrum: {
    name: 'Spectrum Business',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Try the star code first:`,
      `1. Pick up your business phone`,
      `2. Dial *92${d10(ai)} and press Call`,
      `3. If you hear a confirmation, hang up — you're done!`,
      ``,
      `If the star code doesn't work (some plans require activating the feature in the portal first):`,
      `1. Log into your Spectrum Business account at business.spectrum.com`,
      `2. Go to Voice → Call Forwarding → No Answer Forwarding`,
      `3. Enable the feature, enter: ${fmt(ai)}, and save`,
      `4. Then try the star code again (or leave it enabled through the portal)`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — *92 is the likely no-answer code for Cox Business;
  // still needs verification on a real Cox Business Voice line.
  cox: {
    name: 'Cox Business',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Try the star code first:`,
      `1. Pick up your business phone`,
      `2. Dial *92${d10(ai)} and press Call`,
      `3. If you hear a confirmation, hang up — you're done!`,
      ``,
      `If the star code doesn't work:`,
      `1. Log into Cox Business at myaccount.cox.com`,
      `2. Go to My Services → Voice → Features → Call Forwarding`,
      `3. Enable "No Answer Forwarding" and enter: ${fmt(ai)}`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — *92 is the likely no-answer code for Frontier;
  // still needs verification on a real Frontier line.
  frontier: {
    name: 'Frontier',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Pick up your business phone`,
      `2. Dial *92${d10(ai)} and press Call`,
      `3. You'll hear a confirmation, then hang up`,
      ``,
      `If the star code doesn't work, call Frontier at 800-921-8101 and ask them to enable "no-answer call forwarding to ${fmt(ai)}."`,
      testNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  // ── CLOUD / VOIP (PORTAL-ONLY) ─────────────────────────────────────────────

  ringcentral: {
    name: 'RingCentral',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes about 3 minutes):`,
      `1. Go to app.ringcentral.com and log in`,
      `2. Click your name/avatar → Settings`,
      `3. Go to Call Handling & Forwarding`,
      `4. Under "If no one answers," add: ${fmt(ai)}`,
      `5. Save — you're done!`,
      portalTestNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  google_voice: {
    name: 'Google Voice',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes about 2 minutes):`,
      `1. Go to voice.google.com and log in`,
      `2. Click the gear icon (Settings) → Calls`,
      `3. Under "Call Forwarding," add: ${fmt(ai)}`,
      `4. Set the ring timeout to 4–5 rings so your phone gets a chance to answer`,
      `5. Save — you're done!`,
      portalTestNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  vonage: {
    name: 'Vonage Business',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `This sets up conditional forwarding — your phone rings normally, and only calls you miss go to the AI.`,
      ``,
      `Turn it on (takes about 3 minutes):`,
      `1. Log into your Vonage Business portal at businessportal.vonage.com`,
      `2. Go to Dashboard → Call Forwarding`,
      `3. Select "No Answer" forwarding (not "Always" — that bypasses your phone entirely)`,
      `4. Enter: ${fmt(ai)} and save`,
      portalTestNote(ai),
      ``,
      `Text me back once you've tested it. ${sign}`,
    ].join('\n'),
  },

  other: {
    name: 'Other / Landline / VoIP',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `We want conditional forwarding — your phone rings normally, and only missed calls go to the AI (not unconditional/forward-all, which would bypass your phone).`,
      ``,
      `Try this first — *92 works on most landlines and business VoIP for no-answer forwarding:`,
      `1. Pick up your business phone`,
      `2. Dial *92${d10(ai)} and press Call`,
      `3. If you hear a confirmation tone, hang up — you're done!`,
      ``,
      `If *92 doesn't work, text me back and I'll look up the exact code for your provider — takes 5 minutes.`,
      testNote(ai),
      ``,
      `${sign}`,
    ].join('\n'),
  },

};

// ─── Carrier options for dropdowns ───────────────────────────────────────────

const CARRIER_OPTIONS = [
  { value: 'verizon',          label: 'Verizon Wireless' },
  { value: 'att',              label: 'AT&T Wireless' },
  { value: 'tmobile',          label: 'T-Mobile / Sprint' },
  { value: 'uscellular',       label: 'US Cellular' },
  { value: 'xfinity',          label: 'Xfinity Voice (Residential)' },
  { value: 'comcast_business', label: 'Comcast Business (VoiceEdge)' },
  { value: 'spectrum',         label: 'Spectrum Business' },
  { value: 'cox',              label: 'Cox Business' },
  { value: 'frontier',         label: 'Frontier' },
  { value: 'ringcentral',      label: 'RingCentral' },
  { value: 'google_voice',     label: 'Google Voice' },
  { value: 'vonage',           label: 'Vonage Business' },
  { value: 'other',            label: 'Other / Landline / VoIP' },
];

/**
 * Returns the SMS body for a given carrier and AI number.
 * Falls back to 'other' if carrier is unknown.
 */
function getSmsGuide(carrierSlug, aiNumber, businessName) {
  const carrier = CARRIERS[carrierSlug] ?? CARRIERS.other;
  return carrier.sms(aiNumber, businessName);
}

module.exports = { CARRIERS, CARRIER_OPTIONS, getSmsGuide };
