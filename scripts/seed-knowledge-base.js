'use strict';
// node --env-file=/var/www/aria/.env scripts/seed-knowledge-base.js
//
// Populates the knowledge_base table from the Reachwell Sales Playbook.
// Re-runnable: deletes and re-inserts each article by category+title.
// Run this whenever you update the content below to push changes to the trainer.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ARTICLES = [

  // ── PRODUCT ─────────────────────────────────────────────────────────────────

  {
    category: 'product',
    title: 'What Reachwell Sells',
    content: `An AI receptionist that answers a business's missed calls 24/7, talks to the caller naturally, captures their name and number and what they need, and instantly texts that lead to the owner — so they never lose a job to voicemail again.

THE CORE PROBLEM: Small home-services businesses (plumbers, HVAC, electricians) miss 20–40% of their calls — they're on a job, it's after hours, they're already on the phone. Most people who hit voicemail just hang up and call the next company. Every missed call is a lost job, often worth hundreds or thousands of dollars.

PRICING: $500 setup + $297/mo. No long-term contract, cancel anytime, 14-day money-back guarantee.`,
  },

  {
    category: 'product',
    title: 'Full AI Capabilities',
    content: `When a customer calls the business's AI number, the AI:

• Answers every call, 24/7 — nights, weekends, holidays, never busy, never sick, never on another line.
• Greets with the business's name: "Thank you for calling [Business Name]! How can I help you today?"
• Talks naturally — doesn't sound robotic, handles the conversation smoothly.
• Captures the caller's name and callback number — every single caller, so nothing falls through the cracks.
• Understands the trade — knows plumbing issues (drains, leaks, water heaters, burst pipes) and/or HVAC issues (AC, heating, furnaces, no heat/no cool) depending on the business.
• Texts the lead to the owner immediately — name, number, and what they need.
• Detects emergencies and escalates instantly — burst pipe, flooding, gas leak, no heat in winter, no AC in extreme heat → AI reassures the caller and transfers the call straight to the owner's cell.
• Transfers to a human on request — if the caller asks to speak to a person, it forwards to the owner's phone.
• Handles after-hours the way the owner chooses: take a message, forward to cell, emergency-only, or custom message.
• Respects a do-not-say list — won't say things the owner doesn't want said.
• Never quotes prices or makes firm commitments — always says "the team will confirm."

WHAT IT DOES NOT DO (be honest if asked):
• Doesn't book appointments directly into a calendar — captures the lead, owner books. Calendar booking is a future premium add-on.
• Not a human — won't build deep rapport like a great human receptionist.
• Captures the lead; the owner still calls the customer back to close the job.`,
  },

  // ── COMPARISON ──────────────────────────────────────────────────────────────

  {
    category: 'comparison',
    title: 'vs Human Receptionist / Answering Service',
    content: `WHERE WE WIN (lead with these):
• 24/7 coverage — humans don't work nights/weekends, or charge a fortune for it. ~35–40% of home-services calls come after hours and most emergencies happen then. We cover exactly what humans can't.
• Never misses a call — never on a break, never on another line, never sick.
• Far cheaper — fraction of what human answering services cost ($400–$2,500/month for human services vs. our $297/mo).
• Perfectly consistent — same quality every call, follows the script every time, respects the do-not-say list every time.
• Instant emergency escalation — recognizes urgent calls and transfers to the owner immediately.

WHERE A HUMAN IS BETTER (acknowledge honestly if asked):
• Genuine warmth and relationship-building.
• Handling truly unusual or complex calls with human judgment.
• Actually booking appointments (our premium upsell later).

THE HONEST POSITIONING: "We're not here to replace a great human receptionist — we're here to catch the calls you're currently missing, which is 20–40% of them, 24/7, for a fraction of the cost. Right now those calls go to voicemail and you lose them. We turn them into captured leads."`,
  },

  // ── FORWARDING / TECHNICAL SETUP ─────────────────────────────────────────────

  {
    category: 'forwarding',
    title: 'How the Number and Forwarding Works',
    content: `THE SETUP IS ADDITIVE — clients change nothing they don't want to.

The client gets a new local phone number (the AI's number). It does NOT replace their existing business number.

WAY 1 — MOST COMMON, RECOMMENDED: Keep existing number, forward missed calls to AI.
• They keep their current number everywhere — website, Google, trucks, cards. Nothing visible changes for customers.
• They set their existing line to "forward on no-answer" to the AI number. This is a standard phone feature.
• Flow: customer calls normal number → if not answered → auto-forwards to AI → AI answers and captures the lead.
• Their phone still rings normally for calls they CAN answer. Only MISSED calls go to AI.
• This is "conditional / no-answer forwarding" — NOT "forward all calls," which would stop their phone ringing entirely.

WAY 2 — LESS COMMON: Use the AI number as the main number. Better for newer businesses without an established number.

"WHAT IF I DON'T HAVE A WEBSITE?": Doesn't matter. Forwarding happens at the phone level, not the website level. No website, no tech, no changing your number required.

THE TWO DIRECTIONS OF FORWARDING:
1. Their existing line → AI number (catching missed calls): the CLIENT sets this up on their phone/carrier. We send them exact star-code instructions for their carrier.
2. AI number → owner's cell (for emergencies / human requests): built into our system automatically.

CRITICAL ONBOARDING POINT (prevents #1 churn cause): The whole thing only works if the client actually sets up the forwarding. Walk non-technical clients through it on a call and TEST it together — call their number from a DIFFERENT phone (calling from their own line can bypass forwarding and make it look broken). Don't consider them fully live until forwarding is confirmed working. A client who pays but never sets up forwarding sees no value and cancels thinking it doesn't work.`,
  },

  // ── SCRIPT ──────────────────────────────────────────────────────────────────

  {
    category: 'script',
    title: 'The Sales Script (All 7 Stages)',
    content: `STAGE 1 — OPENER (earn the first 10 seconds)
"Hey, is this [name]? I'll be quick — when you're out on a job and the phone rings, what usually happens to that call?"
STOP. Let them answer. Their reply — "voicemail," "I miss it" — is your hook.

STAGE 2 — THE PAIN (make it real, in their words)
"Yeah, that's what I hear from most guys. The rough part is, most people who hit voicemail just call the next plumber — so those missed calls are basically paid jobs going to your competition. Any idea how many you miss in a week?"
Let them guess. Whatever they say, that's money walking out the door — let it land.

STAGE 3 — THE SOLUTION (simple, outcome-first, NO tech jargon)
"So here's what I set up. Something that answers those calls for you — around the clock, even nights and weekends. It talks to the customer, gets their info and what they need, and texts it straight to you so you can call them right back. Voicemail catches nothing. This catches the job."

STAGE 4 — THE DEMO (the close — KEEP THEM ON THE LINE)
Best: conference the demo bot in while still on the call.
"Honestly, easier to just hear it. Stay on the line one sec — I'm going to patch you in so you hear exactly what your customer would hear."
Or play a recording: "Let me play you 30 seconds of it handling a real call."
NEVER say "call this number and call me back" — that's how you lose them. Bring the demo to them.

STAGE 5 — THE REACTION
"So — pretty real, right? Your customers wouldn't know that's not a person picking up."
Pause. Let them react.

STAGE 6 — THE CLOSE (assume the sale, state price, then STOP)
"So here's how it works — I get this running on your line this week. It's $500 to set up, then $297 a month. One job it catches usually covers a couple months. Want me to get you set up?"
Say the price, then STOP talking. Whoever speaks first after the price loses.

STAGE 7 — THE PAYMENT (close on the call)
"Great — I'm sending you a secure payment link right now. Can you fill it out while we're on the line so I can get you set up today?"
"Later" is where deals die. Closing on the call is everything.`,
  },

  // ── OBJECTIONS ──────────────────────────────────────────────────────────────

  {
    category: 'objections',
    title: 'Objection: I don\'t trust a robot with my customers',
    content: `"Totally fair — that's why I had you hear it instead of just describing it. You heard how natural it is. Your customers won't know, and right now the alternative is voicemail, which loses them completely. This is just better than what's happening today."`,
  },

  {
    category: 'objections',
    title: 'Objection: Let me think about it',
    content: `"Makes sense. Only thing is — every day it's off, you're still missing those calls. Tell you what: let's turn it on, and if it's not catching you real leads in the first couple weeks, you cancel. No long contract. Fair?"`,
  },

  {
    category: 'objections',
    title: 'Objection: That\'s a lot / How much again',
    content: `"I hear you. But you said you miss [their number] calls a week. If even one of those is a $300–450 job, this pays for itself the first week. Everything after that is money you're currently leaving on the table."`,
  },

  {
    category: 'objections',
    title: 'Objection: I already have an answering service',
    content: `"Nice — how much are you paying for it? Most answering services are message-takers that cost a lot more and don't work nights and weekends. This is 24/7, knows your trade, and is a fraction of the price. Worth hearing the difference?"`,
  },

  {
    category: 'objections',
    title: 'Objection: I\'m too busy right now',
    content: `"Totally get it — that's actually the point. You're busy on jobs, which is exactly when calls get missed. This handles them so you don't have to. Two minutes to hear it?"`,
  },

  {
    category: 'objections',
    title: 'Objection: Can I see it on MY business first',
    content: `"Good question — and here's the thing: the demo you just heard IS the system. Yours will be set up with your business name, your services, your hours — but the intelligence handling the call is exactly what you heard. The only difference is it'll say [their business name] instead of the demo name."

For a hard skeptic: set it up, let them test their own bot, with payment committed first — never provision free for someone who hasn't committed.`,
  },

  {
    category: 'objections',
    title: 'Objection: Do I have to change my number',
    content: `"Nope — you keep your number exactly as is. You just set your phone to forward calls you don't answer to the new number, so the missed ones get caught. Your phone still rings normally for calls you can grab. I'll walk you through the setup, takes a couple minutes."`,
  },

  {
    category: 'objections',
    title: 'Objection: I don\'t have a website',
    content: `"Doesn't matter — this has nothing to do with a website. It works off your phone. You don't need a website, you don't need to change your number, you don't need any tech. You just forward your missed calls to it."`,
  },

  {
    category: 'objections',
    title: 'Objection: Does it book appointments',
    content: `"Right now it captures the lead — name, number, what they need — and texts it to you so you call them back. Booking straight into your calendar is something we can add down the road, but most guys want to call the customer back themselves anyway to confirm details."`,
  },

  {
    category: 'objections',
    title: 'Objection: Will it mess up / Is it actually good',
    content: `"It's good enough that your customers won't know it's not a person — you just heard it. It's not perfect like nothing is, but the alternative right now is voicemail, which catches zero. This catches the jobs you're losing today."`,
  },

  {
    category: 'objections',
    title: 'Objection: What if there\'s an emergency',
    content: `"It's built for that. If someone calls with a burst pipe or no heat, it recognizes it's urgent, reassures them, and transfers the call straight to your cell immediately — so you never miss an emergency job."`,
  },

  // ── RULES / COMMISSION ───────────────────────────────────────────────────────

  {
    category: 'rules',
    title: 'Contractor Rules and Commission Structure',
    content: `RULES:
• Work your lead list top to bottom (they're pre-ranked).
• Use the script. Get them to hear the demo — that's what closes.
• Keep them on the line through the demo AND the payment. Never "call me back."
• Don't promise capabilities beyond what's listed (no calendar booking, no CRM — not built yet).
• Don't quote prices beyond $500 setup + $297/mo.
• Follow calling laws — respect do-not-call requests and calling hours.
• Log every call outcome with /call (outcome, objection, demo method, notes).
• For "interested" that don't close, mark them and follow up.
• You never handle the client's payment card — they use the secure payment link.
• If you can't answer something, say so — don't make something up.

YOUR PAY:
• $100/mo base (paid regardless of closes)
• $400 per close (setup commission)
• Residual: your % of monthly MRR per active client (18-month cap per client)

TYPICAL JOB VALUES (for ROI math with prospects):
• Plumbing: $300–450 per job average
• HVAC: $300–500 per job average
• Emergency calls: 1.5–2x normal rate`,
  },

];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`Seeding ${ARTICLES.length} knowledge base articles…\n`);

  for (const a of ARTICLES) {
    // Delete-then-insert so re-runs always reflect current content
    await pool.query(
      `DELETE FROM knowledge_base WHERE category = $1 AND title = $2`,
      [a.category, a.title]
    );
    await pool.query(
      `INSERT INTO knowledge_base (category, title, content, is_placeholder, updated_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [a.category, a.title, a.content]
    );
    console.log(`  ✓ [${a.category}] ${a.title}`);
  }

  const { rows: [{ count }] } = await pool.query(`SELECT COUNT(*) FROM knowledge_base`);
  console.log(`\nDone. knowledge_base now has ${count} total entries.`);
  console.log('Trainer will use this content immediately — no restart needed.');
  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
