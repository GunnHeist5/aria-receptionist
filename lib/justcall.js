'use strict';

/**
 * JustCall API client (v2.1).  Docs: https://developer.justcall.io/
 * Credentials come from env — NEVER hardcode:
 *   JUSTCALL_API_KEY, JUSTCALL_API_SECRET   (Profile → APIs and Webhooks)
 *   JUSTCALL_API_BASE  (optional; default https://api.justcall.io)
 *
 * ⚠️ The Authorization header format below ("<key>:<secret>") is what JustCall's
 * docs describe, but it has NOT been verified against a live call here. The probe
 * script (scripts/justcall-probe.js) is what confirms it — if it 401s, adjust
 * authHeader() to whatever the JustCall API reference shows for your account.
 */

const BASE = (process.env.JUSTCALL_API_BASE || 'https://api.justcall.io').replace(/\/$/, '');

function authHeader() {
  const key    = (process.env.JUSTCALL_API_KEY || '').trim();
  const secret = (process.env.JUSTCALL_API_SECRET || '').trim();
  if (!key || !secret) throw new Error('JUSTCALL_API_KEY / JUSTCALL_API_SECRET not set in .env');
  return `${key}:${secret}`;
}

async function jc(method, path, { query, body } = {}) {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method,
    headers: { Authorization: authHeader(), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`JustCall ${res.status} ${path}: ${(json.message || text).toString().slice(0, 200)}`);
  return json;
}

/** List recent calls. params: page, per_page, agent_id, from_datetime, to_datetime, … */
function listCalls(params = {}) { return jc('GET', '/v2.1/calls', { query: { per_page: 20, ...params } }); }

/** Full call object (metadata, recording URL, disposition, …). */
function getCall(id) { return jc('GET', `/v2.1/calls/${id}`); }

/**
 * A call's AI data — transcript + summary. Toggle what to pull.
 * Path verified live: `/v2.1/calls_ai/{id}` (the docs index's `/calls/{id}/ai`
 * 404s; the help article's `/calls_ai/{id}` is the real route). Returns { status, data }.
 */
function getCallAi(id, opts = {}) {
  return jc('GET', `/v2.1/calls_ai/${id}`, {
    query: {
      fetch_transcription: opts.transcription ?? true,
      fetch_summary:       opts.summary       ?? true,
      fetch_ai_insights:   opts.insights      ?? false,
      fetch_action_items:  opts.actionItems   ?? false,
    },
  });
}

/**
 * Flatten JustCall's transcript array → plain text for the extractor.
 * JustCall shape (per docs): [{ speaker_id, sentence, timestamp }, ...]
 * ⚠️ Verify the exact key names against a real AI response once calling is live.
 */
function transcriptToText(callTranscription) {
  if (!Array.isArray(callTranscription)) return '';
  return callTranscription
    .map(t => `Speaker ${t.speaker_id ?? t.speaker ?? '?'}: ${t.sentence ?? t.text ?? ''}`.trim())
    .filter(Boolean)
    .join('\n');
}

module.exports = { jc, listCalls, getCall, getCallAi, transcriptToText };
