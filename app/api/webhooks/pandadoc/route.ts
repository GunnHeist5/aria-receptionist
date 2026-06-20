import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

async function tgSend(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.PANDADOC_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get('x-pandadoc-signature');
    if (sig !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body      = await req.json();
  const event     = body?.event ?? body?.type;
  const docId     = body?.data?.id ?? body?.document?.id;
  const metadata  = body?.data?.metadata ?? body?.document?.metadata ?? {};

  if (event !== 'document.completed') return NextResponse.json({ ok: true, ignored: true });

  const pool         = getPool();
  const contractorId = metadata.contractor_id;
  if (!contractorId) {
    console.error('[pandadoc] no contractor_id in metadata', docId);
    return NextResponse.json({ ok: true });
  }

  // Mark signed, set onboarding_step=3 (burst messages sent here, worker handles day 7+)
  await pool.query(
    `UPDATE contractors SET
       contract_document_id = $2,
       contract_signed_at   = NOW(),
       onboarding_status    = 'contract_signed',
       onboarding_step      = 3,
       updated_at           = NOW()
     WHERE id = $1`,
    [contractorId, docId]
  );

  const { rows: [rep] } = await pool.query(
    `SELECT name, channel_id, slug, commission_setup, commission_residual_pct FROM contractors WHERE id = $1`,
    [contractorId]
  );

  if (!rep?.channel_id || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: true });

  const token      = process.env.TELEGRAM_BOT_TOKEN;
  const chatId     = rep.channel_id;
  const firstName  = rep.name.split(' ')[0];
  const intakeLink = rep.slug
    ? `https://reachwellhq.com/intake?ref=${rep.slug}`
    : 'https://reachwellhq.com/intake';

  // Message 1 — welcome + product + commission + closer link
  await tgSend(token, chatId,
    `✅ <b>You're in, ${firstName}.</b> Contract signed — let's get you up and running right now.\n\n` +
    `<b>What you're selling:</b>\nAI phone receptionist for local service businesses (HVAC, plumbing, electrical, roofing). It catches missed calls 24/7, qualifies the lead, and texts the owner instantly. They keep their existing number.\n\n` +
    `<b>Pricing:</b> $500 setup + $297/mo. No contract, cancel anytime. 14-day money-back.\n\n` +
    `<b>Your commission:</b> $${rep.commission_setup || '?'} per close + ${rep.commission_residual_pct || '?'}% monthly residual — paid every month they stay.\n\n` +
    `🔗 <b>Your closer link</b> (send this when someone says yes):\n${intakeLink}\n\n` +
    `<b>Daily target:</b> 80-100 dials. Expect 10-15 connects. 1 demo per day = good session.\n\nNext message: the pitch. 👇`
  );

  // Message 2 — full pitch
  await tgSend(token, chatId,
    `📋 <b>The pitch</b>\n\n` +
    `<b>Opening:</b>\n"Quick question — when someone calls your business and you don't pick up, what happens to that call?"\n\n` +
    `<i>Let them answer. Most say voicemail or "we usually get them."</i>\n\n` +
    `<b>Transition:</b>\n"So you're losing leads every week without knowing it. We built an AI that catches those calls 24/7 — qualifies the caller and texts you the lead instantly. Takes 10 minutes to set up. Worth 2 minutes to hear how it works?"\n\n` +
    `<b>Demo points:</b>\n• Works on their existing number (call forwarding on no-answer)\n• AI speaks naturally, asks qualifying questions\n• Owner gets a text: name, number, and what they need\n• $500 setup, $297/mo, no contract, 14-day guarantee\n\n` +
    `<b>Close:</b>\n"I'll send you the link right now — takes 5 minutes and your AI is live within 24 hours. Sound good?"\n\n` +
    `[PLACEHOLDER — update after your first 20 calls]\n\nNext message: objection playbook. 👇`
  );

  // Message 3 — objection playbook + all commands
  await tgSend(token, chatId,
    `🛡️ <b>Objection playbook</b>\n\n` +
    `<b>"Already have an answering service"</b>\n→ "That handles calls you pick up. This handles ones you miss — after hours, weekends, when you're on a job. Totally different gap."\n\n` +
    `<b>"How much does it cost?"</b>\n→ "One job you would've missed covers the first month. $297/mo, no contract. I'll send the link so you can see it before committing."\n\n` +
    `<b>"Need to think / talk to my partner"</b>\n→ "Fair. What's the main thing you'd want to think through? I can answer it now."\n\n` +
    `<b>"Don't trust AI"</b>\n→ "This isn't ChatGPT — it does one thing: answer missed calls and capture leads. You can call the number right now and hear it yourself."\n\n` +
    `<b>"Too busy"</b>\n→ "That's exactly why it makes sense. 5 minutes to set up, runs itself."\n\n` +
    `[PLACEHOLDER — log real objections with /objection as you hit them]\n\n` +
    `<b>Your commands:</b>\n` +
    `• <code>/log 80 12 3 1</code> — end-of-day totals (dials/connects/demos/closes)\n` +
    `• <code>/call</code> — log a connect with outcome + objection (~15 sec, tappable)\n` +
    `• <code>/stats</code> — your numbers + unpaid commissions\n` +
    `• <code>/objection [what they said]</code> — log a new objection\n` +
    `• <code>/help</code> — all commands\n\n` +
    `You're ready to dial. Ask me anything — just text here. Let's go 💪`
  );

  return NextResponse.json({ ok: true });
}
