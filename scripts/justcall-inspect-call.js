'use strict';
// Inspect a real JustCall call: metadata + AI/transcript. If a transcript exists,
// run the extractor on the REAL data — verifying the actual format end to end.
//   node --env-file=.env scripts/justcall-inspect-call.js [callId]
// No callId → uses the most recent call.

const jc = require('../lib/justcall');
const { extractCallData } = require('../sales-manager/agents/call-extractor');

async function main() {
  let callId = process.argv[2];
  if (!callId) {
    const list  = await jc.listCalls({ per_page: 1 });
    const calls = list?.data ?? [];
    if (!calls.length) { console.log('No calls in the account.'); return; }
    callId = calls[0].id;
    console.log('Using most recent call id:', callId);
  }

  const call = await jc.getCall(callId);
  const c    = call?.data ?? call;
  console.log('\n── CALL METADATA ──');
  console.log('agent_email :', c.agent_email);
  console.log('call_info   :', JSON.stringify(c.call_info));
  console.log('justcall_ai :', JSON.stringify(c.justcall_ai)?.slice(0, 400));

  console.log('\n── AI DATA (/calls/{id}/ai) ──');
  try {
    const ai   = await jc.getCallAi(callId);
    const body = ai?.data ?? ai;
    console.log('AI response keys:', Object.keys(body).join(', '));
    const tx = body.call_transcription;
    if (Array.isArray(tx) && tx.length) {
      console.log('transcript entries:', tx.length, '| first-entry keys:', Object.keys(tx[0]).join(', '));
      console.log('first entry:', JSON.stringify(tx[0]));
      const text = jc.transcriptToText(tx);
      console.log('\n── flattened transcript (first 500 chars) ──\n' + text.slice(0, 500));
      console.log('\n── EXTRACTOR ON THE REAL TRANSCRIPT ──');
      console.log(JSON.stringify(await extractCallData(text, { summary: body.call_summary }), null, 2));
      console.log('\n✅ Real end-to-end extraction worked — transcript format confirmed.');
    } else {
      console.log('No transcript array present — this call has no AI/transcription (expected during the hold).');
      console.log('Raw AI body (trimmed):', JSON.stringify(body).slice(0, 400));
    }
  } catch (e) {
    console.log('AI fetch failed:', e.message, '— call likely has no AI data yet.');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
