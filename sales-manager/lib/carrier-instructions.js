'use strict';

/**
 * Carrier call-forwarding instruction library.
 *
 * Each entry has:
 *   name        — display name shown to client
 *   confidence  — 'high' = verified / carrier-published. 'medium' = documented but unverified on a real line. UPDATE as you test.
 *   sms(aiNumber, businessName) — returns the full copy-paste SMS body to send the client
 *
 * TO UPDATE A CARRIER: edit the sms() function for that carrier. The AI number is passed
 * as E.164 (e.g. +12155551234). Use d10(aiNumber) to get the 10-digit form for dial codes.
 *
 * CONFIDENCE GUIDE:
 *   high   = works reliably, confirmed by carrier docs or real-world testing
 *   medium = code is publicly documented but you should test on a real line before trusting at scale
 */

const d10  = n => String(n).replace(/\D/g, '').slice(-10);
const fmt  = n => { const d = d10(n); return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; };
const sign = '— Justin';

// ─── Carrier library ──────────────────────────────────────────────────────────

const CARRIERS = {

  verizon: {
    name: 'Verizon Wireless',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type *71${d10(ai)} and press Call`,
      `3. You'll hear a confirmation tone, then hang up`,
      ``,
      `After that, every call you miss automatically goes to your AI. That's it!`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  att: {
    name: 'AT&T Wireless',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type *61*+1${d10(ai)}# and press Call`,
      `3. You'll hear a success message, then hang up`,
      ``,
      `After that, every call you miss automatically goes to your AI.`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  tmobile: {
    name: 'T-Mobile / Sprint',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type **61*+1${d10(ai)}**20# and press Call`,
      `   (the 20 = how many seconds before it forwards)`,
      `3. You'll hear a confirmation, then hang up`,
      ``,
      `After that, every call you miss automatically goes to your AI.`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — test on a real US Cellular line before trusting at scale
  uscellular: {
    name: 'US Cellular',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Open your phone's dialer`,
      `2. Type *92${d10(ai)} and press Call`,
      `3. You'll hear a confirmation, then hang up`,
      ``,
      `If that doesn't work, call US Cellular at 611 and ask them to enable "no-answer call forwarding" to ${fmt(ai)}.`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — star code works on most Xfinity Voice plans but not all; portal is the sure path
  comcast: {
    name: 'Comcast / Xfinity Business Voice',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on — try the quick way first:`,
      `1. Pick up your business phone`,
      `2. Dial *71${d10(ai)} and press Call`,
      `3. If you hear a confirmation, hang up — you're done!`,
      ``,
      `If that doesn't work:`,
      `1. Go to xfinity.com and log in`,
      `2. Go to My Account → Voice → Call Forwarding`,
      `3. Turn on "No Answer" forwarding and enter: ${fmt(ai)}`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — verify on a real Spectrum Business line
  spectrum: {
    name: 'Spectrum Business',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on — try the quick way first:`,
      `1. Pick up your business phone`,
      `2. Dial *92${d10(ai)} and press Call`,
      `3. If you hear a confirmation, hang up — you're done!`,
      ``,
      `If that doesn't work, log into your Spectrum Business account online → Voice → Call Forwarding → No Answer → enter ${fmt(ai)}.`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — verify on a real Cox Business line
  cox: {
    name: 'Cox Business',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on:`,
      `1. Log into Cox Business at myaccount.cox.com`,
      `2. Go to My Services → Voice → Features → Call Forwarding`,
      `3. Enable "No Answer Forwarding" and enter: ${fmt(ai)}`,
      `4. Save — you're done!`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  // ⚠️ MEDIUM CONFIDENCE — verify on a real Frontier line
  frontier: {
    name: 'Frontier',
    confidence: 'medium',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on (takes 30 seconds):`,
      `1. Pick up your business phone`,
      `2. Dial *92${d10(ai)} and press Call`,
      `3. You'll hear a confirmation, then hang up`,
      ``,
      `If that doesn't work, call Frontier at 800-921-8101 and ask them to enable "no-answer call forwarding" to ${fmt(ai)}.`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
    ].join('\n'),
  },

  ringcentral: {
    name: 'RingCentral',
    confidence: 'high',
    sms: (ai, biz) => [
      `Hi! Your AI receptionist for ${biz} is ready — one quick step and it goes live.`,
      ``,
      `Your AI number: ${fmt(ai)}`,
      ``,
      `Turn it on (takes about 3 minutes):`,
      `1. Go to app.ringcentral.com and log in`,
      `2. Click your name/avatar → Settings`,
      `3. Go to Call Handling & Forwarding`,
      `4. Under "If no one answers," add: ${fmt(ai)}`,
      `5. Save — you're done!`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
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
      `Turn it on (takes about 2 minutes):`,
      `1. Go to voice.google.com and log in`,
      `2. Click the gear icon (Settings) → Calls`,
      `3. Under "Call Forwarding," add: ${fmt(ai)}`,
      `4. Save — you're done!`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
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
      `Turn it on (takes about 3 minutes):`,
      `1. Log into your Vonage Business portal at businessportal.vonage.com`,
      `2. Go to Dashboard → Call Forwarding`,
      `3. Enable "No Answer" forwarding and enter: ${fmt(ai)}`,
      `4. Save — you're done!`,
      ``,
      `Text me back when you've done it so I can confirm it's working. ${sign}`,
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
      `Try this first — works on most landlines:`,
      `1. Pick up your business phone`,
      `2. Dial *71${d10(ai)} and press Call`,
      `3. If you hear a confirmation tone, hang up — you're done!`,
      ``,
      `If that doesn't work, just text me back and I'll walk you through it — every provider is a little different, takes 5 minutes with my help.`,
      ``,
      `${sign}`,
    ].join('\n'),
  },

};

// ─── Carrier options for dropdowns ───────────────────────────────────────────

const CARRIER_OPTIONS = [
  { value: 'verizon',      label: 'Verizon Wireless' },
  { value: 'att',          label: 'AT&T Wireless' },
  { value: 'tmobile',      label: 'T-Mobile / Sprint' },
  { value: 'uscellular',   label: 'US Cellular' },
  { value: 'comcast',      label: 'Comcast / Xfinity Business Voice' },
  { value: 'spectrum',     label: 'Spectrum Business' },
  { value: 'cox',          label: 'Cox Business' },
  { value: 'frontier',     label: 'Frontier' },
  { value: 'ringcentral',  label: 'RingCentral' },
  { value: 'google_voice', label: 'Google Voice' },
  { value: 'vonage',       label: 'Vonage Business' },
  { value: 'other',        label: 'Other / Landline / VoIP' },
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
