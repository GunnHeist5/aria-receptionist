'use strict';
// Verify the EXTRACTION logic on a synthetic transcript — no real call data needed.
// Confirms the AI returns the exact enum fields call_outcomes / /insights expect.
//   node --env-file=.env scripts/test-call-extraction.js
//
// This proves the extractor works; it does NOT prove the real JustCall transcript
// format matches (that needs a live call — flagged).

const { extractCallData } = require('../sales-manager/agents/call-extractor');

const SAMPLES = [
  {
    label: 'busy + price hesitation, asks for recording demo, callback',
    transcript: `
Speaker 0: Hi, is this the owner of Joe's Plumbing? Quick question — when you're on a job and the phone rings, what happens to that call?
Speaker 1: Usually goes to voicemail. Why?
Speaker 0: Right, and most people who hit voicemail just call the next plumber. We set up an AI receptionist that answers 24/7, gets their info, and texts it to you. Two minutes to hear it?
Speaker 1: Sounds interesting but I'm slammed right now and money's tight this month.
Speaker 0: Fair. One job it catches covers a couple months. Can I send a quick recording demo to listen to later?
Speaker 1: Yeah send the recording, I'll think about it. Call me back next week.`,
  },
  {
    label: 'agreed to sign up on the call (closed)',
    transcript: `
Speaker 0: ...so it's $500 to set up, $297 a month, cancel anytime. Want me to get you set up?
Speaker 1: You know what, yeah, let's do it. My business is losing calls every week.
Speaker 0: Great — sending you the payment link right now, fill it out while we're on the line.
Speaker 1: Okay, doing it now... done.`,
  },
];

async function main() {
  for (const s of SAMPLES) {
    console.log(`\n── ${s.label} ──`);
    const out = await extractCallData(s.transcript.trim());
    console.log(JSON.stringify(out, null, 2));
  }
  console.log('\nThese fields map straight into call_outcomes (outcome, primary_objection, demo_method, notes=summary).');
  console.log('Reminder: closes for PAY come from Stripe, not from outcome="closed" here.');
}

main().catch(e => { console.error('extraction test failed:', e.message); process.exit(1); });
