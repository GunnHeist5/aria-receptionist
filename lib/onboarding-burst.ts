// Sends the 3-message onboarding burst to a newly signed contractor.
// Called from two places:
//   1. PandaDoc webhook (document.completed) — if channel_id is already set
//   2. Telegram /start handler — if they connect Telegram after signing

async function tgSend(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export async function sendOnboardingBurst(rep: {
  name: string;
  slug: string | null;
  channel_id: string;
  commission_setup: number | null;
  commission_residual_pct: number | null;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !rep.channel_id) return;

  const chatId      = rep.channel_id;
  const firstName   = rep.name.split(' ')[0];
  const intakeToken = process.env.INTAKE_TOKEN ? `&token=${process.env.INTAKE_TOKEN}` : '';
  const intakeLink  = rep.slug
    ? `https://reachwellhq.com/intake?ref=${rep.slug}${intakeToken}`
    : `https://reachwellhq.com/intake${intakeToken ? `?${intakeToken.slice(1)}` : ''}`;

  // Message 1 — welcome + product + commission + closer link
  await tgSend(token, chatId,
    `✅ <b>You're in, ${firstName}.</b> Contract signed — let's get you up and running right now.\n\n` +
    `<b>What you're selling:</b>\nAI phone receptionist for local service businesses (HVAC, plumbing, electrical, roofing). It catches missed calls 24/7, qualifies the lead, and texts the owner instantly. They keep their existing number.\n\n` +
    `<b>Client pricing:</b> $400 setup + $297/mo. No contract, cancel anytime. 14-day money-back.\n\n` +
    `<b>Your pay:</b>\n• $100/mo base (paid regardless)\n• $${rep.commission_setup ?? 400} per close\n• ${rep.commission_residual_pct ?? 10}% monthly residual per client (18-month cap)\n\n` +
    `🔗 <b>Your closer link</b> (send this when someone says yes):\n${intakeLink}\n\n` +
    `<b>Daily target:</b> 80-100 dials. Expect 10-15 connects. 1 demo per day = good session.\n\nNext message: the pitch. 👇`
  );

  // Message 2 — the 7-stage sales script
  await tgSend(token, chatId,
    `📋 <b>The script (7 stages)</b>\n\n` +
    `<b>1 — Opener</b>\n` +
    `"Hey, is this [name]? I'll be quick — when you're out on a job and the phone rings, what usually happens to that call?"\n` +
    `<i>Stop. Let them answer — "voicemail" / "I miss it" is your hook.</i>\n\n` +
    `<b>2 — Pain</b>\n` +
    `"Yeah, that's what I hear from most guys. Rough part is, most people who hit voicemail just call the next [trade] — so those missed calls are basically paid jobs going to your competition. Any idea how many you miss in a week?"\n` +
    `<i>Let them guess. Let it land.</i>\n\n` +
    `<b>3 — Solution (no tech jargon)</b>\n` +
    `"So here's what I set up. Something that answers those calls for you — around the clock, nights and weekends. It talks to the customer, gets their info and what they need, and texts it straight to you so you can call them back. Voicemail catches nothing. This catches the job."\n\n` +
    `<b>4 — Demo ⚠️ KEEP THEM ON THE LINE</b>\n` +
    `"Easier to just hear it. Stay on the line — I'm going to patch you in."\n` +
    `Or: "Let me play you 30 seconds of a real call."\n` +
    `<b>NEVER say "call this number and call me back" — that's how you lose them.</b>\n\n` +
    `<b>5 — Reaction</b>\n` +
    `"Pretty real, right? Your customers wouldn't know that's not a person."\n` +
    `<i>Pause. Let them react.</i>\n\n` +
    `<b>6 — Close (state price, then STOP)</b>\n` +
    `"Here's how it works — $400 to set up, $297 a month. One job it catches covers a couple months. Want me to get you set up?"\n` +
    `<b>Say the price, then stop. Whoever speaks first loses.</b>\n\n` +
    `<b>7 — Payment (close on the call)</b>\n` +
    `"Great — sending you a payment link right now. Fill it out while we're on the line?"\n` +
    `<i>"Later" is where deals die.</i>\n\nNext: objection playbook. 👇`
  );

  // Message 3 — full objection playbook + commands
  await tgSend(token, chatId,
    `🛡️ <b>Objection playbook</b>\n\n` +
    `<b>"Don't trust a robot with my customers"</b>\n→ "That's why I had you hear it — not describe it. You heard how natural it is. Right now the alternative is voicemail, which loses them completely."\n\n` +
    `<b>"Let me think about it"</b>\n→ "Every day it's off, you're missing those calls. Let's turn it on — if it's not catching real leads in the first couple weeks, you cancel. No long contract. Fair?"\n\n` +
    `<b>"That's a lot / How much?"</b>\n→ "If even one missed call a week is a $300–450 job, this pays for itself the first week. Everything after is money you're currently leaving."\n\n` +
    `<b>"Already have an answering service"</b>\n→ "How much are you paying? Most are message-takers, cost more, and don't work nights and weekends. This is 24/7, knows your trade, fraction of the price."\n\n` +
    `<b>"Too busy"</b>\n→ "That's exactly the point — you're busy on jobs, which is when calls get missed. Two minutes to hear it?"\n\n` +
    `<b>"Do I have to change my number?"</b>\n→ "Nope — keep everything as-is. You just forward calls you don't answer to the new number. Your phone still rings normally."\n\n` +
    `<b>"What if there's an emergency?"</b>\n→ "Built for it. Burst pipe, no heat — it recognizes it's urgent and transfers straight to your cell immediately."\n\n` +
    `<b>"Can I see it on my business first?"</b>\n→ "The demo you just heard IS the system — your business name, your services, your hours. Same intelligence."\n\n` +
    `Ask me any objection you run into — just text it here and I'll give you a response.\n\n` +
    `<b>Your commands:</b>\n` +
    `• <code>/log 80 12 3 1</code> — end-of-day totals (dials / connects / demos / closes)\n` +
    `• <code>/call</code> — log a connect with outcome + objection in ~15 sec (tappable)\n` +
    `• <code>/stats</code> — your 7-day numbers + unpaid commissions\n` +
    `• <code>/objection [what they said]</code> — log an objection for pattern tracking\n` +
    `• <code>/insights</code> — your objection breakdown and demo close rate\n` +
    `• <code>/help</code> — all commands\n\n` +
    `You're ready to dial. Ask me anything — just text here. Let's go 💪`
  );
}
