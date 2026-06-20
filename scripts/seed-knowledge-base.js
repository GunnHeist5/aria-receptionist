'use strict';
// node --env-file=/var/www/aria/.env scripts/seed-knowledge-base.js
// ALL CONTENT BELOW IS PLACEHOLDER — replace after you validate your real script and objections.
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const ENTRIES = [
  {
    category: 'product',
    title: 'What Reachwell sells [PLACEHOLDER]',
    content: `[PLACEHOLDER — replace with your validated pitch after first closings]

Reachwell sells an AI phone receptionist to plumbing and HVAC businesses. The AI answers every missed call 24/7, qualifies the caller, and texts the lead info to the business owner instantly. No voicemail. No lost leads.

Pricing: $499/month flat. One-time setup included. Month-to-month, cancel anytime.

Key value props:
- The average plumber misses 35-40% of inbound calls
- Each missed call is a $200-800 job walking away
- The AI pays for itself on the first lead it captures
- Setup takes 10 minutes — they don't change how they work`,
  },
  {
    category: 'script',
    title: 'Opening cold call script [PLACEHOLDER]',
    content: `[PLACEHOLDER — replace with your validated opening after testing it on real calls]

OPENER:
"Hi, is this [Owner Name]? Hey [Name], this is [Your Name] calling from Reachwell. Quick question — when someone calls your business and you don't pick up, what happens to that call?"

[Let them answer — they'll say voicemail or "I call them back"]

"Right. So we built an AI that answers that call for you — qualifies them, finds out what they need, and texts you the lead instantly. 24/7. Never miss another job. Takes 10 minutes to set up. Do you have two minutes?"

NOTES:
- Open with a question, not a feature dump
- The goal of the opener is to get them curious, not to close
- If they say 'not interested' before you finish: go to objection handling`,
  },
  {
    category: 'script',
    title: 'Demo script — live call walkthrough [PLACEHOLDER]',
    content: `[PLACEHOLDER — replace after you've closed 3+ clients and know what demo flows best]

HOW TO DEMO ON THE CALL:
"Here's the easiest way to show you — give me your business number. I'm going to call it right now while we're on the phone, you let it go to our AI, and you'll get a text in about 30 seconds with the lead."

[They give the number. Call the demo line: +1-XXX-XXX-XXXX]
[They hear the AI answer. It captures their info. They get the SMS.]

"Did you get it? That's exactly what your customers will experience. And that text goes to you — or whoever you want."`,
  },
  {
    category: 'objections',
    title: 'Objection: We already have an answering service [PLACEHOLDER]',
    content: `[PLACEHOLDER — replace after you know which response actually converts]

RESPONSE:
"That's great — and I don't want to replace that. The difference is, this isn't a human answering service. There's no per-minute cost, no hold times, and it texts you the lead info the second the call ends. What does your current service do with the lead info?"

[Let them answer]

"Right — with ours, you get a text with their name, number, and what they need within 30 seconds. And it's $499 flat, no per-call fees. Most guys keep both for a month, then drop the other one."`,
  },
  {
    category: 'objections',
    title: 'Objection: I always answer my phone [PLACEHOLDER]',
    content: `[PLACEHOLDER]

RESPONSE:
"I believe you — and you're probably better at it than most. But what about when you're on a job, both hands in a pipe, and your phone rings? Or 9pm on a Sunday? We did a study — the average plumber misses about 3 out of every 10 calls just because of timing. This just catches the ones that slip through. Want to see it in action real quick?"`,
  },
  {
    category: 'objections',
    title: 'Objection: $499 is too expensive [PLACEHOLDER]',
    content: `[PLACEHOLDER]

RESPONSE:
"Totally fair. What's your average job worth — like a drain cleaning or small repair?"

[They say $150-$300 usually]

"So if this catches one job a month you would've missed, it's paid for itself. Most guys tell us it pays for itself in the first week. And it's month-to-month — if it doesn't work, cancel. No contract."`,
  },
  {
    category: 'objections',
    title: 'Objection: I need to think about it / talk to my wife [PLACEHOLDER]',
    content: `[PLACEHOLDER]

RESPONSE:
"Of course — and I want you to feel good about it. Here's what I'd suggest: let me text you the demo number right now. Call it yourself when you have a minute — or have your wife call it — so you can both hear exactly what your customers would experience. Then I'll follow up in two days. Fair enough?"

[Always get a specific follow-up time. "I'll call back sometime" = dead lead]`,
  },
  {
    category: 'technical',
    title: 'Your setup and tools as a Reachwell rep [PLACEHOLDER]',
    content: `[PLACEHOLDER — update with real tools when they're confirmed]

YOUR LEAD LIST:
- Access your leads at: [your personal leads URL — sent in onboarding]
- Leads are sorted by city/state. Work them in geographic batches.
- Mark leads as called, interested, or not interested directly in the sheet.

DEMO LINE:
- Use the demo number: [PLACEHOLDER — confirm before giving to reps]
- When a prospect calls it, it routes to the Murphy's Plumbing demo bot
- They'll get a text within 30 seconds to their number

LOGGING YOUR ACTIVITY:
- Every day, send /log to the Reachwell Telegram bot
- Format: /log [dials] [connects] [demos] [closes]
- Example: /log 80 12 4 1
- This is how commissions are tracked and how coaching is personalized`,
  },
  {
    category: 'faq',
    title: 'How do I get paid? [PLACEHOLDER]',
    content: `[PLACEHOLDER — confirm commission structure and payment method before using]

COMMISSION STRUCTURE (PLACEHOLDER):
- Setup commission: $[X] per client who completes Stripe payment
- Residual: [X]% of monthly MRR while client stays active
- Residuals stop if a client churns — active only

WHEN YOU GET PAID:
- Commissions accrue when the client's card clears Stripe
- Payments are made [weekly/biweekly — TBD] via [Venmo/Zelle/ACH — TBD]
- Your dashboard in the Reachwell system shows your tally in real time`,
  },
  {
    category: 'faq',
    title: 'What if a prospect asks a question I can\'t answer? [PLACEHOLDER]',
    content: `[PLACEHOLDER]

OPTIONS:
1. "Great question — let me find out and text you in 10 minutes." Then message the Reachwell bot and we'll answer.
2. For pricing, legal, or technical questions: always defer. Never guess.
3. For product questions: try the AI trainer bot first — type your question in Telegram and it'll answer.

WHAT TO NEVER SAY:
- Never promise features we don't have (calendar booking, CRM integration — not built yet)
- Never guarantee a specific ROI number
- Never discuss other clients or their data`,
  },
];

async function run() {
  let inserted = 0;
  for (const entry of ENTRIES) {
    await p.query(
      `INSERT INTO knowledge_base (category, title, content, is_placeholder)
       VALUES ($1, $2, $3, true)
       ON CONFLICT DO NOTHING`,
      [entry.category, entry.title, entry.content]
    );
    inserted++;
  }
  console.log(`Seeded ${inserted} KB entries (all marked is_placeholder=true).`);
  console.log('Replace content after you validate your real script and objections.');
  await p.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
