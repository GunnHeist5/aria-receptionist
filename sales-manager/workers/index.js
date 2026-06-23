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

      // Transcribe audio — supports direct files and Vocaroo links
      let transcript = candidate.transcript;
      if (!transcript && candidate.submission_url) {
        const url = candidate.submission_url.toLowerCase();

        // Resolve Vocaroo share URLs (voca.ro/ID or vocaroo.com/ID) to direct mp3
        let fetchUrl = candidate.submission_url;
        const vocarooMatch = url.match(/(?:voca\.ro|vocaroo\.com)\/([a-zA-Z0-9]+)/);
        if (vocarooMatch) fetchUrl = `https://media1.vocaroo.com/mp3/${vocarooMatch[1]}`;

        const isAudio = /\.(mp3|m4a|wav|ogg|webm)(\?|$)/.test(fetchUrl.toLowerCase()) || !!vocarooMatch;
        if (isAudio) {
          try {
            const audioRes = await fetch(fetchUrl);
            const arrayBuf = await audioRes.arrayBuffer();
            const ext      = fetchUrl.toLowerCase().match(/\.(mp3|m4a|wav|ogg|webm)/)?.[1] ?? 'mp3';
            const file     = new File([arrayBuf], `submission.${ext}`, { type: `audio/${ext}` });
            const result   = await openai.audio.transcriptions.create({ file, model: 'whisper-1' });
            transcript     = result.text;
          } catch (e) {
            transcript = `[Transcription failed for ${candidate.submission_url}: ${e.message}. Manual review required.]`;
          }
        } else {
          transcript = `[Auto-transcription not available for this URL type: ${candidate.submission_url}. Manual review required.]`;
        }
        await pool.query(`UPDATE candidates SET transcript = $1 WHERE id = $2`, [transcript, candidate.id]);
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
// ONBOARDING SEQUENCE — steps 0-2 are null (burst-sent at contract sign via
// pandadoc webhook). Worker only handles step 3 (day 7) and step 4 (day 14).
// ---------------------------------------------------------------------------
const ONBOARDING_STEPS = [
  null, // step 0 — sent in pandadoc burst (welcome + product + commission + link)
  null, // step 1 — sent in pandadoc burst (full pitch)
  null, // step 2 — sent in pandadoc burst (objection playbook + commands)
  {
    day: 7,
    message: async (rep) => {
      const { rows: [m] } = await pool.query(`
        SELECT
          COALESCE(SUM(dials), 0)    AS dials,
          COALESCE(SUM(connects), 0) AS connects,
          COALESCE(SUM(demos), 0)    AS demos,
          COALESCE(SUM(closes), 0)   AS closes
        FROM rep_activity
        WHERE contractor_id = $1 AND date >= NOW() - INTERVAL '7 days'
      `, [rep.id]);

      const dials    = Number(m?.dials    ?? 0);
      const connects = Number(m?.connects ?? 0);
      const demos    = Number(m?.demos    ?? 0);
      const closes   = Number(m?.closes   ?? 0);
      const cRate    = dials   > 0 ? ((connects / dials)   * 100).toFixed(1) : null;
      const dRate    = connects > 0 ? ((demos    / connects) * 100).toFixed(1) : null;

      const statsLine = dials === 0
        ? `Looks like you haven't logged any activity yet — try <code>/log 80 12 3 0</code> at end of each day.`
        : `<b>Your week 1 numbers:</b>\n• Dials: ${dials}${dials < 400 ? ' (target 400+)' : ' ✅'}\n` +
          `• Connects: ${connects}${cRate ? ` (${cRate}% connect rate)` : ''}\n` +
          `• Demos: ${demos}${demos < 5 ? ' (target 5+)' : ' ✅'}\n` +
          `• Closes: ${closes}`;

      const diagnosis = dials === 0
        ? `\n\nFirst thing: start logging with /log each day so I can actually help you. What's been going on?`
        : dials < 200
        ? `\n\n<b>Volume is the issue.</b> Under 200 dials in week 1 means you're not getting enough at-bats. Target 80-100 per day.`
        : cRate && parseFloat(cRate) < 8
        ? `\n\n<b>Connect rate is low (${cRate}%).</b> Try 8-9am or 4-6pm local — owners are between jobs. Avoid Tuesday afternoons and Mondays before 10.`
        : dRate && parseFloat(dRate) < 20
        ? `\n\n<b>Connects but not getting to demo.</b> Tell me the exact response you keep getting on the opener and I'll help you rework it.`
        : demos > 0 && closes === 0
        ? `\n\n<b>Getting demos but not closing.</b> Log your next 5 connects with /call — the objection breakdown will show us where deals are dying.`
        : closes > 0
        ? `\n\n<b>You've got a close. That's real.</b> Keep the volume up — each week it compounds.`
        : `\n\nWhat's the biggest thing you're running into? Just ask.`;

      return `📊 <b>Week 1 check-in</b>\n\n${statsLine}${diagnosis}`;
    },
  },
  {
    day: 14,
    message: async (rep) => {
      const { rows: [m] } = await pool.query(`
        SELECT
          COALESCE(SUM(dials), 0)  AS dials,
          COALESCE(SUM(closes), 0) AS closes
        FROM rep_activity
        WHERE contractor_id = $1 AND date >= NOW() - INTERVAL '14 days'
      `, [rep.id]);

      const dials  = Number(m?.dials  ?? 0);
      const closes = Number(m?.closes ?? 0);

      if (closes > 0) {
        return `Two weeks in — ${closes} close${closes > 1 ? 's' : ''}. You're on the board.\n\n` +
          `Keep the volume at 80-100/day. Each client you add is $${rep.commission_residual_pct || '?'}% residual forever. What objections are you hitting most? Log them with /objection.`;
      }

      if (dials < 600) {
        return `Two weeks in. ${dials} dials total — target was 800+.\n\n` +
          `Volume is the only lever that matters right now. At 80/day for 2 weeks you'd have 1,120 dials. The close will come with the reps. What's getting in the way of the dial count?`;
      }

      return `Two weeks in, ${dials} dials, no closes yet. That's frustrating — let's find where it's breaking.\n\n` +
        `Run /stats and tell me:\n1. What's your connect rate?\n2. What's the most common objection?\n\nIf you're converting connects to demos above 20%, the issue is the close. Below that, it's the opener or timing. Let's fix it.`;
    },
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

      // Skip null placeholder steps (burst-sent at contract sign)
      let step = rep.onboarding_step;
      while (step < ONBOARDING_STEPS.length && ONBOARDING_STEPS[step] === null) {
        step++;
        await pool.query(
          `UPDATE contractors SET onboarding_step = $2, updated_at=NOW() WHERE id = $1`,
          [rep.id, step]
        );
      }

      const nextStep = ONBOARDING_STEPS[step];
      if (!nextStep || daysSinceSigning < nextStep.day) continue;

      const msg = await nextStep.message(rep);
      await tg.send(rep.channel_id, msg);
      await pool.query(
        `UPDATE contractors SET onboarding_step = $2, updated_at=NOW() WHERE id = $1`,
        [rep.id, step + 1]
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
