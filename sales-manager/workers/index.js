'use strict';
// PM2 entry: node --env-file=/var/www/aria/.env sales-manager/workers/index.js
const { Pool }             = require('pg');
const OpenAI               = require('openai');
const tg                   = require('../lib/telegram');
const flags                = require('../config/flags');
const { screenCandidate }  = require('../agents/screener');
const { coachRep }         = require('../agents/coach');
const { analyzeForOffboarding } = require('../agents/offboard-proposer');
const { runScriptLoop }         = require('../agents/script-iterator');

const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// SCREENING — runs every 5 min
// ---------------------------------------------------------------------------
async function runScreening() {
  const { rows } = await pool.query(
    `SELECT * FROM candidates WHERE status = 'applied' AND submission_url IS NOT NULL LIMIT 5`
  );
  for (const candidate of rows) {
    try {
      await pool.query(`UPDATE candidates SET status = 'screening' WHERE id = $1`, [candidate.id]);

      // Transcribe audio if URL looks like a direct audio file
      let transcript = candidate.transcript;
      if (!transcript && candidate.submission_url) {
        const url = candidate.submission_url.toLowerCase();
        if (/\.(mp3|m4a|wav|ogg|webm)(\?|$)/.test(url)) {
          const audioRes  = await fetch(candidate.submission_url);
          const arrayBuf  = await audioRes.arrayBuffer();
          const ext       = url.match(/\.(mp3|m4a|wav|ogg|webm)/)?.[1] ?? 'mp3';
          const file      = new File([arrayBuf], `submission.${ext}`, { type: `audio/${ext}` });
          const result    = await openai.audio.transcriptions.create({ file, model: 'whisper-1' });
          transcript      = result.text;
          await pool.query(`UPDATE candidates SET transcript = $1 WHERE id = $2`, [transcript, candidate.id]);
        } else {
          transcript = `[Auto-transcription not available for this URL type: ${candidate.submission_url}. Manual review required.]`;
          await pool.query(`UPDATE candidates SET transcript = $1 WHERE id = $2`, [transcript, candidate.id]);
        }
      }

      const result = await screenCandidate(pool, { ...candidate, transcript });

      await pool.query(
        `UPDATE candidates SET
           status              = 'scored',
           score               = $2,
           score_breakdown     = $3,
           hire_recommendation = $4,
           llm_reasoning       = $5
         WHERE id = $1`,
        [candidate.id, result.score, JSON.stringify(result.breakdown),
         result.hire_recommendation, result.reasoning]
      );

      // Always gate on human approval (autonomous flag reserved for later)
      const msg = `<b>New Candidate Scored</b>\n\n` +
        `<b>${candidate.name}</b> (${candidate.email})\n` +
        `Score: <b>${result.score}/100</b> — ${result.hire_recommendation?.replace('_', ' ').toUpperCase()}\n\n` +
        `<b>Strengths:</b> ${(result.strengths ?? []).join(', ') || 'none noted'}\n` +
        `<b>Red flags:</b> ${(result.red_flags ?? []).join(', ') || 'none'}\n\n` +
        `<b>Reasoning:</b> ${result.reasoning ?? ''}\n\n` +
        `Approve to send offer; deny to archive.`;

      await tg.sendToOwner(msg, tg.approvalKeyboard('candidate', candidate.id));
    } catch (err) {
      console.error('[screening] error for candidate', candidate.id, err.message);
      await pool.query(`UPDATE candidates SET status = 'applied' WHERE id = $1`, [candidate.id]);
    }
  }
}

// ---------------------------------------------------------------------------
// MONITORING — runs every hour, computes 7d + 30d metrics per active rep
// ---------------------------------------------------------------------------
async function runMonitoring() {
  const { rows: reps } = await pool.query(
    `SELECT id, name FROM contractors WHERE active = true AND contract_signed_at IS NOT NULL`
  );
  for (const rep of reps) {
    try {
      for (const [days, label] of [[7, 'week'], [30, 'month']]) {
        const { rows: [m] } = await pool.query(`
          SELECT
            COALESCE(SUM(dials), 0)    AS total_dials,
            COALESCE(SUM(connects), 0) AS total_connects,
            COALESCE(SUM(demos), 0)    AS total_demos,
            COALESCE(SUM(closes), 0)   AS total_closes
          FROM rep_activity
          WHERE contractor_id = $1 AND date >= CURRENT_DATE - $2
        `, [rep.id, days]);

        const connectRate = m.total_dials   > 0 ? (m.total_connects / m.total_dials) * 100 : null;
        const demoRate    = m.total_connects > 0 ? (m.total_demos    / m.total_connects) * 100 : null;
        const closeRate   = m.total_demos   > 0 ? (m.total_closes   / m.total_demos) * 100 : null;

        const flags_ = [];
        if (m.total_dials === 0)           flags_.push('zero_dials');
        if (connectRate !== null && connectRate < 5) flags_.push('low_connect_rate');
        if (closeRate   !== null && closeRate   < 10) flags_.push('low_close_rate');

        const health = m.total_dials === 0 ? 'silent'
          : flags_.length >= 2             ? 'red'
          : flags_.length === 1            ? 'yellow'
          : 'green';

        await pool.query(`
          INSERT INTO rep_metrics
            (contractor_id, period_type, period_start, period_end,
             total_dials, total_connects, total_demos, total_closes,
             connect_rate, demo_rate, close_rate, health_status, flags)
          VALUES ($1, $2, CURRENT_DATE - $3, CURRENT_DATE,
                  $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [rep.id, label, days, m.total_dials, m.total_connects, m.total_demos, m.total_closes,
            connectRate, demoRate, closeRate, health, JSON.stringify(flags_)]);
      }
    } catch (err) {
      console.error('[monitoring] error for rep', rep.id, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// COACHING — runs daily at configured hour
// ---------------------------------------------------------------------------
async function runCoaching() {
  const { rows: reps } = await pool.query(`
    SELECT c.*, EXTRACT(WEEK FROM AGE(NOW(), c.contract_signed_at)) AS weeks_active
    FROM contractors c
    WHERE c.active = true AND c.contract_signed_at IS NOT NULL
  `);

  const { rows: [peer] } = await pool.query(`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_dials) AS median_dials
    FROM rep_metrics WHERE period_type = 'week'
      AND period_start >= CURRENT_DATE - 7
  `);

  for (const rep of reps) {
    try {
      const { rows: [m7] }  = await pool.query(
        `SELECT * FROM rep_metrics WHERE contractor_id=$1 AND period_type='week' ORDER BY computed_at DESC LIMIT 1`, [rep.id]);
      const { rows: [m30] } = await pool.query(
        `SELECT * FROM rep_metrics WHERE contractor_id=$1 AND period_type='month' ORDER BY computed_at DESC LIMIT 1`, [rep.id]);
      const { rows: prev }  = await pool.query(
        `SELECT * FROM coaching_sessions WHERE contractor_id=$1 ORDER BY created_at DESC LIMIT 3`, [rep.id]);

      const result = await coachRep(pool, rep, m7 ?? {}, m30 ?? {}, peer ?? {}, prev);

      if (result.action === 'no_action') continue;
      if (result.action === 'escalate_to_human') {
        await tg.sendToOwner(`⚠️ <b>Coaching escalation: ${rep.name}</b>\n\n${result.internal_notes}`);
        continue;
      }

      // Send coaching message to rep via their channel
      if (rep.channel_id && result.coaching_message) {
        await tg.send(rep.channel_id, result.coaching_message);
      }

      await pool.query(
        `INSERT INTO coaching_sessions
           (contractor_id, trigger, input_snapshot, diagnosis, coaching_content, internal_notes, action_taken, sent_at)
         VALUES ($1, 'scheduled', $2, $3, $4, $5, $6, NOW())`,
        [rep.id, JSON.stringify({ m7, peer }), result.diagnosis,
         result.coaching_message, result.internal_notes, result.action]
      );

      // Update last_active_at if rep has dialed recently
      if ((m7?.total_dials ?? 0) > 0) {
        await pool.query(`UPDATE contractors SET last_active_at = NOW() WHERE id = $1`, [rep.id]);
      }
    } catch (err) {
      console.error('[coaching] error for rep', rep.id, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// OFFBOARDING — runs daily, humane thresholds, human-gated by default
// ---------------------------------------------------------------------------
async function runOffboarding() {
  const { rows: reps } = await pool.query(`
    SELECT * FROM contractors
    WHERE active = true AND contract_signed_at IS NOT NULL
      AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '${flags.INACTIVITY_REENGAGEMENT_DAYS} days')
      AND id NOT IN (SELECT contractor_id FROM offboarding_proposals WHERE status = 'pending')
  `);

  for (const rep of reps) {
    try {
      const daysSilent = Math.floor(
        (Date.now() - new Date(rep.last_active_at ?? rep.created_at).getTime()) / 86_400_000
      );

      // Fetch re-engagement log from coaching_sessions with trigger='re_engagement'
      const { rows: reLog } = await pool.query(
        `SELECT created_at AS date, coaching_content AS message_sent, contractor_reply AS response
         FROM coaching_sessions WHERE contractor_id=$1 AND trigger='re_engagement' ORDER BY created_at`,
        [rep.id]
      );

      // If not enough re-engagement attempts, send one instead of proposing offboarding
      if (reLog.length < flags.MIN_REENGAGEMENT_ATTEMPTS) {
        if (rep.channel_id) {
          const msg = `Hey ${rep.name.split(' ')[0]}, just checking in — haven't seen any activity from you in a while. Everything ok? Still interested in running with Reachwell? No pressure, just want to make sure you have what you need. 👋`;
          await tg.send(rep.channel_id, msg);
          await pool.query(
            `INSERT INTO coaching_sessions (contractor_id, trigger, coaching_content, action_taken, sent_at)
             VALUES ($1, 're_engagement', $2, 'sent', NOW())`,
            [rep.id, msg]
          );
        }
        continue;
      }

      // Enough attempts made with no response — analyze for offboarding
      if (daysSilent < flags.INACTIVITY_OFFBOARD_DAYS) continue;

      const { rows: activity } = await pool.query(`
        SELECT DATE_TRUNC('week', date)::date AS week_start,
               SUM(dials) AS dials, SUM(closes) AS closes
        FROM rep_activity WHERE contractor_id=$1 AND date >= NOW() - INTERVAL '60 days'
        GROUP BY 1 ORDER BY 1
      `, [rep.id]);

      const { rows: comms } = await pool.query(`
        SELECT created_at::date AS date, contractor_reply AS message FROM coaching_sessions
        WHERE contractor_id=$1 AND contractor_reply IS NOT NULL ORDER BY created_at DESC LIMIT 20
      `, [rep.id]);

      const result = await analyzeForOffboarding(pool, rep, activity, comms, reLog);

      if (result.recommendation === 'continue_monitoring') continue;

      if (result.recommendation === 'escalate_to_human') {
        await tg.sendToOwner(`⚠️ <b>Rep needs attention: ${rep.name}</b>\n\n${result.reasoning}`);
        continue;
      }

      // recommendation === 'offboard' — create proposal and notify owner
      const { rows: [proposal] } = await pool.query(
        `INSERT INTO offboarding_proposals
           (contractor_id, reasoning, re_engagement_log, activity_summary, proposed_message)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [rep.id, result.reasoning, JSON.stringify(reLog),
         JSON.stringify(activity), result.proposed_offboarding_message]
      );

      const tgMsg = `🔴 <b>Offboarding Proposal: ${rep.name}</b>\n\n${result.proposed_telegram_to_owner}\n\nApprove to offboard and send message. Deny to continue.`;
      if (flags.AUTONOMOUS_OFFBOARDING) {
        await executeOffboarding(proposal.id, rep, result.proposed_offboarding_message);
      } else {
        await tg.sendToOwner(tgMsg, tg.approvalKeyboard('offboard', proposal.id));
      }
    } catch (err) {
      console.error('[offboarding] error for rep', rep.id, err.message);
    }
  }
}

async function executeOffboarding(proposalId, rep, message) {
  await pool.query(`UPDATE contractors SET active=false, offboarded_at=NOW() WHERE id=$1`, [rep.id]);
  await pool.query(`UPDATE commissions SET status='canceled' WHERE contractor_id=$1 AND status='accrued'`, [rep.id]);
  await pool.query(`UPDATE offboarding_proposals SET status='executed', executed_at=NOW() WHERE id=$1`, [proposalId]);
  if (rep.channel_id && message) await tg.send(rep.channel_id, message);
  await tg.sendToOwner(`✅ Offboarding executed for ${rep.name}.`);
}

// ---------------------------------------------------------------------------
// ONBOARDING SEQUENCE — checks every tick, sends by day since signing
// ---------------------------------------------------------------------------
const ONBOARDING_STEPS = [
  {
    day: 1,
    message: (rep, intakeLink) => {
      const firstName = rep.name.split(' ')[0];
      return `👋 Day 1 — everything you need to run.\n\n` +
        `<b>What you're selling:</b>\nAI phone receptionist for local service businesses — HVAC, plumbing, electrical, roofing. It catches missed calls 24/7, qualifies the lead, and texts the owner instantly. They keep their existing number.\n\n` +
        `<b>Pricing:</b> $500 setup + $297/mo. No contract, cancel anytime. 14-day money-back.\n\n` +
        `<b>Your commission:</b> $${rep.commission_setup || '?'} per close + ${rep.commission_residual_pct || '?'}% monthly residual (paid as long as they stay).\n\n` +
        `🔗 <b>Your closer link</b> — send this when you have a yes:\n${intakeLink}\n\n` +
        `<b>Daily target:</b> 80-100 dials. Expect 10-15 connects. Even 1 demo per day is a good session.\n\n` +
        `<b>Your commands:</b>\n` +
        `• <code>/log 80 12 3 1</code> — end-of-day totals (dials/connects/demos/closes)\n` +
        `• <code>/call</code> — log a connect with outcome + objection (do this after connects, NOT no-answers)\n` +
        `• <code>/stats</code> — your numbers + unpaid commissions\n` +
        `• <code>/objection [what they said]</code> — log a new objection\n` +
        `• <code>/help</code> — show all commands\n\n` +
        `Ask me anything — product questions, what to say, how to handle an objection. Just text here.\n\nLet's go ${firstName}. 💪`;
    },
  },
  {
    day: 2,
    message: (rep) =>
      `📋 Day 2 — the pitch.\n\n` +
      `<b>Opening:</b>\n"Quick question — when someone calls your business and you don't pick up, what happens to that call?"\n\n` +
      `<i>Let them answer. Most say voicemail or "we usually get them."</i>\n\n` +
      `<b>Transition:</b>\n"So you're losing leads every week and don't even know it. We built an AI that catches those calls 24/7 — it qualifies the caller and texts you the lead instantly. Takes 10 minutes to set up. Worth 2 minutes to hear how it works?"\n\n` +
      `<b>Demo points:</b>\n• Works on their existing number — call forwarding on no-answer\n• AI speaks naturally, asks qualifying questions\n• Owner gets a text: name, number, what they need\n• $500 setup, $297/mo, no contract, 14-day guarantee\n\n` +
      `<b>Close:</b>\n"I'll send you the link right now — takes 5 minutes and your AI is live within 24 hours. Sound good?"\n\n` +
      `[PLACEHOLDER — update after your first 20 calls prove what actually lands]\n\nGot questions about the pitch? Just ask. Tomorrow: objections.`,
  },
  {
    day: 3,
    message: (rep) =>
      `🛡️ Day 3 — objection playbook.\n\n` +
      `<b>"Already have an answering service"</b>\n→ "That handles calls you pick up. This handles the ones you miss — after hours, weekends, when you're on a job. Totally different gap."\n\n` +
      `<b>"How much does it cost?"</b>\n→ "One job you would've missed covers the first month. $297/mo, no contract. I'll send the link — you can see exactly how it works before committing."\n\n` +
      `<b>"Need to think / talk to my partner"</b>\n→ "Totally fair. What's the main thing you'd want to think through? I can answer it now and save you the back-and-forth."\n\n` +
      `<b>"Don't trust AI"</b>\n→ "Skepticism makes sense. This isn't ChatGPT — it does one thing: answer missed calls and capture the lead. You can literally call the number right now and hear it yourself."\n\n` +
      `<b>"Too busy right now"</b>\n→ "That's exactly why it makes sense — you're too busy to answer every call. 5 minutes to set up, runs itself. Want me to send the link so you can look when you have a sec?"\n\n` +
      `[PLACEHOLDER — log real objections with /objection as you hit them. I'll analyze patterns and push updates.]\n\n` +
      `Every objection you log with /objection makes the script better for everyone.`,
  },
  {
    day: 7,
    message: (rep) =>
      `📊 One week in — let's debrief.\n\n` +
      `Check your numbers with /stats.\n\n` +
      `<b>Week 1 benchmarks:</b>\n` +
      `• 400+ dials total\n• Connect rate &gt;10% = good hours\n• 5+ demos given = pipeline building\n\n` +
      `<b>If connect rate is low (&lt;8%):</b>\nTry 8-9am or 4-6pm local time — owners are between jobs then.\n\n` +
      `<b>If connects but no demos:</b>\nYour opener might not be landing. Tell me the exact response you keep getting and I'll help you rework it.\n\n` +
      `<b>If demos but no closes:</b>\nLog what's happening with /call — the objection breakdown will show us where deals are dying.\n\n` +
      `What's the biggest thing you're running into? Just ask.`,
  },
  {
    day: 14,
    message: (rep) =>
      `Two weeks in. If you haven't closed yet — that's normal for week 2. Pipeline takes time.\n\n` +
      `The reps who close are the ones doing the volume. Run /stats and tell me your dial count. If it's under 600 for the two weeks, that's the lever to pull first — not the script.\n\n` +
      `If you're hitting volume and still not closing, text me the objection you keep getting. We'll fix it.\n\n` +
      `What do your numbers look like?`,
  },
];

async function runOnboarding() {
  const { rows: reps } = await pool.query(`
    SELECT * FROM contractors
    WHERE active=true AND contract_signed_at IS NOT NULL AND onboarding_step < $1 AND channel_id IS NOT NULL
  `, [ONBOARDING_STEPS.length]);

  for (const rep of reps) {
    try {
      const daysSinceSigning = Math.floor(
        (Date.now() - new Date(rep.contract_signed_at).getTime()) / 86_400_000
      );

      const nextStep = ONBOARDING_STEPS[rep.onboarding_step];
      if (!nextStep || daysSinceSigning < nextStep.day) continue;

      const intakeLink = rep.slug
        ? `https://reachwellhq.com/intake?ref=${rep.slug}`
        : 'https://reachwellhq.com/intake (ask manager for your ref link)';

      const msg = nextStep.message(rep, intakeLink);
      await tg.send(rep.channel_id, msg);
      await pool.query(
        `UPDATE contractors SET onboarding_step = $2, updated_at=NOW() WHERE id = $1`,
        [rep.id, rep.onboarding_step + 1]
      );
    } catch (err) {
      console.error('[onboarding] error for rep', rep.id, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// SCRIPT LOOP — runs weekly (Monday morning UTC)
// ---------------------------------------------------------------------------
let lastScriptRun = null;

async function runScriptLoopIfDue() {
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isHour   = now.getUTCHours() === 9; // 9am UTC
  const key      = `${now.getUTCFullYear()}-W${Math.floor(now.getUTCDate() / 7)}`;

  if (!isMonday || !isHour || lastScriptRun === key) return;
  lastScriptRun = key;

  try {
    await runScriptLoop(pool, tg.sendToOwner.bind(tg), tg.approvalKeyboard.bind(tg));
  } catch (err) {
    console.error('[script-loop]', err.message);
  }
}

// Expose for Telegram webhook handler to call
module.exports = { executeOffboarding };

// ---------------------------------------------------------------------------
// SCHEDULER
// ---------------------------------------------------------------------------
let lastCoachingRun = null;
let lastOffboardRun = null;

async function tick() {
  const now = new Date();
  const hourUTC = now.getUTCHours();

  await runScreening().catch(e => console.error('[tick:screening]', e.message));
  await runMonitoring().catch(e => console.error('[tick:monitoring]', e.message));
  await runOnboarding().catch(e => console.error('[tick:onboarding]', e.message));
  await runScriptLoopIfDue().catch(e => console.error('[tick:script-loop]', e.message));

  if (hourUTC === flags.COACHING_HOUR_UTC && lastCoachingRun !== now.toDateString()) {
    lastCoachingRun = now.toDateString();
    await runCoaching().catch(e => console.error('[tick:coaching]', e.message));
    await runOffboarding().catch(e => console.error('[tick:offboarding]', e.message));
    lastOffboardRun = now.toDateString();
  }
}

console.log('[aria-sales] Sales manager worker starting…');
tick();
setInterval(tick, 5 * 60 * 1000); // every 5 minutes
