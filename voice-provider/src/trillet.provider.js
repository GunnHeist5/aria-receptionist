'use strict';

/**
 * TrilletVoiceProvider — production implementation of the VoiceProvider interface.
 *
 * Trillet data model (one shared workspace, one agent+flow+number per client):
 *
 *   Our Workspace  (TRILLET_WORKSPACE_ID)
 *     Agent  (_id stored as clients.voice_provider_account_id)
 *       ├── phoneNumberIds  [numberId] — linked immediately after purchase
 *       └── pathway         flowId    — set by Trillet when call flow created with agent:id
 *     CallFlow  (_id retrievable via GET /agents/{id} → agent.pathway)
 *       └── prompt + customWelcomeMessage (full system config from content pack)
 *     PhoneNumber  (_id retrievable via agent.phoneNumberIds[0])
 *       └── agentId config — routes inbound calls to our agent
 *
 * Required env vars:
 *   TRILLET_API_KEY          Agency-level API key
 *   TRILLET_WORKSPACE_ID     Workspace UUID (see scripts/trillet-probe.js)
 *   TRILLET_API_BASE_URL     Defaults to https://api.trillet.ai/v1
 *
 * NEVER use `payment_failed` for provisioning failures — that event type
 * is reserved for Stripe/billing. Throw VoiceProviderError; callers write
 * `provisioning_step` events.
 */

const { VoiceProvider, VoiceProviderError } = require('./interface');

// Defaults applied when creating a new Trillet agent.
// Change these here only — never hard-code elsewhere.
const AGENT_DEFAULTS = {
  ttsModel: { provider: 'rime', voiceId: 'mistv3_luna', language: 'en' },
  llmModel: 'gemini-2.5-flash',
  settings: { speed: 0.95 },
};

// Trillet's PUT /agents/:id is a full replace, not PATCH.
// Only send fields Trillet accepts as writable; sending read-only fields
// (_id, workspaceId, status, createdAt, updatedAt) causes 500s.
const AGENT_WRITABLE = ['name', 'llmModel', 'ttsModel', 'settings', 'phoneNumberIds', 'pathway'];

function agentUpdate(existing, overrides) {
  const base = {};
  for (const f of AGENT_WRITABLE) {
    if (existing[f] !== undefined) base[f] = existing[f];
  }
  return { ...base, ...overrides };
}

class TrilletVoiceProvider extends VoiceProvider {
  constructor() {
    super();
    if (!process.env.TRILLET_API_KEY) {
      throw new Error('TrilletVoiceProvider: TRILLET_API_KEY is not set.');
    }
    if (!process.env.TRILLET_WORKSPACE_ID) {
      throw new Error(
        'TrilletVoiceProvider: TRILLET_WORKSPACE_ID is not set. ' +
        'Run scripts/trillet-probe.js to discover and save it.'
      );
    }
    /** @private */ this._key  = process.env.TRILLET_API_KEY;
    /** @private */ this._wid  = process.env.TRILLET_WORKSPACE_ID;
    /** @private */ this._base = (process.env.TRILLET_API_BASE_URL || 'https://api.trillet.ai/v1')
                                    .replace(/\/$/, '') + '/api';
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  /**
   * @private
   * @param {'GET'|'POST'|'PUT'|'DELETE'} method
   * @param {string} path   May include query string for GET requests
   * @param {object} [body]
   * @returns {Promise<object>}
   * @throws  {VoiceProviderError}
   */
  async _req(method, path, body) {
    const url  = this._base + path;
    const opts = {
      method,
      headers: {
        'x-api-key':      this._key,
        'x-workspace-id': this._wid,
        'Accept':         'application/json',
        'Content-Type':   'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res, text;
    try {
      res  = await fetch(url, opts);
      text = await res.text();
    } catch (err) {
      throw new VoiceProviderError('_req', `Network error: ${err.message}`, err);
    }

    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) {
      const msg = json?.error || json?.message || text.slice(0, 200);
      throw new VoiceProviderError(path, `HTTP ${res.status}: ${msg}`);
    }
    return json;
  }

  /**
   * @private
   * GET /agents/:id with exponential-backoff retry on 500.
   *
   * Trillet's PUT /agents is non-atomic (delete+recreate on the backend).
   * A GET immediately after a PUT can hit a different replica that hasn't
   * caught up yet and returns 500 "Agent not found". Three retries at
   * 300 / 700 / 1500 ms ride out the inconsistency window reliably.
   */
  async _getAgent(accountId) {
    const delays = [300, 700, 1500];
    let last;
    for (let i = 0; i <= delays.length; i++) {
      try {
        return await this._req('GET', `/agents/${accountId}`);
      } catch (err) {
        last = err;
        if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]));
      }
    }
    throw last;
  }

  // ---------------------------------------------------------------------------
  // 1 — createSubAccount
  //     Creates one Trillet agent per client. accountId = agent._id.
  // ---------------------------------------------------------------------------

  async createSubAccount(clientConfig) {
    try {
      const body = {
        name: clientConfig.businessName,
        ...AGENT_DEFAULTS,
      };
      // If the business has a website, pass it so Trillet can scrape it for
      // additional knowledge (opening hours from Google, service descriptions, etc.).
      // The content pack system prompt is always applied on top regardless.
      if (clientConfig.website) body.websiteUrl = clientConfig.website;

      const agent = await this._req('POST', '/agents', body);
      return { accountId: agent._id, raw: agent };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError('createSubAccount', err.message, err);
    }
  }

  // ---------------------------------------------------------------------------
  // 2 — provisionNumber
  //     Search → purchase → immediately link to agent (routing + agent record).
  // ---------------------------------------------------------------------------

  async provisionNumber(accountId, req) {
    const area = String(req.areaCode || '').replace(/\D/g, '').slice(0, 3);
    if (!area) throw new VoiceProviderError('provisionNumber', 'req.areaCode is required');

    try {
      // Search available numbers
      const search = await this._req('GET',
        `/twilio/available-numbers?country=US&type=local&areaCode=${area}&limit=5`);
      const nums = search.numbers || [];
      if (!nums.length) {
        throw new VoiceProviderError('provisionNumber',
          `No available numbers for area code ${area}. ` +
          'Try a different area code or check Trillet dashboard for availability.');
      }

      // COST: Trillet adds $0.015/min surcharge on top of base call rates for numbers
      // provisioned through their platform (provider: telnyx under the hood).
      // TODO(BYOD): POST /twilio/register-external-number with a number from your own
      // Telnyx/Twilio account to eliminate this surcharge — the margin-optimizing path
      // once volume justifies managing your own number pool.
      const purchase = await this._req('POST', '/twilio/purchase-number', {
        country:     'US',
        type:        'local',
        phoneNumber: nums[0].phoneNumber,
      });
      const e164 = purchase.phoneNumber;
      if (!e164) throw new VoiceProviderError('provisionNumber', 'purchase response missing phoneNumber field');

      // The purchase response omits the Trillet PhoneNumber MongoDB _id needed for
      // config and release calls. Fetch it from the list endpoint instead, matching
      // by workspaceId + E.164 + recent createdAt. Retry — the record can take a few
      // seconds to appear in the list after purchase.
      const LIST_ATTEMPTS  = 4;
      const LIST_RETRY_MS  = 3_000;
      const RECENT_WINDOW  = 120_000; // 2 min — wider than any observed lag
      let numberId;
      for (let i = 0; i < LIST_ATTEMPTS; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, LIST_RETRY_MS));
        const list   = await this._req('GET', '/twilio/user-phone-numbers');
        const cutoff = Date.now() - RECENT_WINDOW;
        const match  = (Array.isArray(list) ? list : [])
          .filter(n =>
            n.workspaceId === this._wid &&
            n.status      === 'active'  &&
            n.phoneNumber === e164       &&
            new Date(n.createdAt).getTime() > cutoff
          )
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        if (match) { numberId = match._id; break; }
      }
      if (!numberId) {
        throw new VoiceProviderError('provisionNumber',
          `Purchased ${e164} but could not retrieve its _id from user-phone-numbers ` +
          `after ${LIST_ATTEMPTS} attempts. Number may still be active — check Trillet ` +
          'dashboard before retrying to avoid a duplicate purchase.'
        );
      }

      // Link number to agent for inbound routing
      await this._req('PUT', `/twilio/phone-numbers/${numberId}/config`, {
        agentId: accountId,
      });

      // Record the numberId on the agent so deprovision can find and release it later.
      // PUT is a full replace — fetch current fields first to avoid wiping other config.
      const currentAgent = await this._getAgent(accountId);
      await this._req('PUT', `/agents/${accountId}`,
        agentUpdate(currentAgent, { phoneNumberIds: [numberId] }));

      return { phoneNumber: e164, numberId, raw: purchase };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError('provisionNumber', err.message, err);
    }
  }

  // ---------------------------------------------------------------------------
  // 3 — applyContentPack
  //     Idempotent: updates existing call flow if one exists; creates if not.
  //     The flow holds the full system prompt + greeting from the content pack.
  // ---------------------------------------------------------------------------

  async applyContentPack(accountId, pack) {
    try {
      const agent = await this._req('GET', `/agents/${accountId}`);

      const flowBody = {
        name:                 `${pack.version}`,
        direction:            'bidirectional',
        promptType:           'simple',
        prompt:               pack.systemPrompt,
        welcomeMessage:       'ai_custom',
        customWelcomeMessage: pack.greeting,
        agent:                accountId,
        settings: {
          callSetting: { maxCallDuration: 600, endCallOnSilence: 10 },
        },
      };

      let flow;
      if (agent.pathway) {
        // Update the existing flow in place (idempotent re-apply)
        flow = await this._req('PUT', `/call-flows/${agent.pathway}`, flowBody);
      } else {
        // First application — create a new call flow, then explicitly link it.
        // Trillet does NOT auto-set agent.pathway when a flow is created with agent:id;
        // without this PUT the agent has no pathway and deprovision/updateConfig break.
        // PUT is a full replace — spread writable fields to avoid wiping workspaceId etc.
        flow = await this._req('POST', '/call-flows', flowBody);
        await this._req('PUT', `/agents/${accountId}`, agentUpdate(agent, { pathway: flow._id }));
      }

      return { success: true, agentId: accountId, raw: flow };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError('applyContentPack', err.message, err);
    }
  }

  // ---------------------------------------------------------------------------
  // 4 — updateConfig
  //     Live config changes: updates the linked call flow.
  //     NOTE: Trillet encodes businessHours/doNotSay/forwardToNumber inside the
  //     system prompt. For those fields, rebuild and re-apply the full content
  //     pack (applyContentPack) rather than calling updateConfig directly.
  //     This method handles lightweight changes: isActive toggling, and any
  //     pre-built prompt/greeting strings passed in via delta.systemPrompt /
  //     delta.greeting (extended fields set by the orchestrator).
  // ---------------------------------------------------------------------------

  async updateConfig(accountId, delta) {
    try {
      const agent = await this._getAgent(accountId);
      if (!agent.pathway) {
        throw new VoiceProviderError('updateConfig',
          'Agent has no linked call flow. Run applyContentPack first.');
      }

      const flowUpdate = {};
      if (delta.systemPrompt  !== undefined) flowUpdate.prompt               = delta.systemPrompt;
      if (delta.greeting      !== undefined) {
        flowUpdate.customWelcomeMessage = delta.greeting;
        flowUpdate.welcomeMessage       = 'ai_custom';
      }
      if (delta.isActive      !== undefined) flowUpdate.isActive             = delta.isActive;

      // If only business-hours / doNotSay / tone changed, the caller must rebuild
      // the full content pack and pass the new systemPrompt in delta.systemPrompt.
      if (!Object.keys(flowUpdate).length) {
        return {
          success: true,
          raw: { note: 'No directly mappable Trillet fields in delta; rebuild content pack for prompt changes.' },
        };
      }

      const updated = await this._req('PUT', `/call-flows/${agent.pathway}`, flowUpdate);
      return { success: true, raw: updated };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError('updateConfig', err.message, err);
    }
  }

  // ---------------------------------------------------------------------------
  // 5 — runTestCall
  //     Initiates an outbound call from the agent to `toNumber`.
  //     Trillet schedules the call asynchronously; `initiated` status means
  //     the job was accepted — outcome arrives via webhook / call-history.
  // ---------------------------------------------------------------------------

  async runTestCall(accountId, toNumber) {
    try {
      const result = await this._req('POST', '/call', {
        to:            toNumber,
        call_agent_id: accountId,
      });
      return {
        success: result.status === 'success',
        callId:  result.callId,
        raw:     result,
      };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError('runTestCall', err.message, err);
    }
  }

  // ---------------------------------------------------------------------------
  // 6 — deprovision
  //     Reads agent state to find numberId and flowId, then tears down in order:
  //     release number → delete call flow → delete agent.
  //     Safe to call more than once: missing IDs are skipped without error.
  // ---------------------------------------------------------------------------

  async deprovision(accountId) {
    const raw = {};
    try {
      const agent    = await this._getAgent(accountId);
      const flowId = agent.pathway;
      // phoneNumberIds may be hydrated objects or plain ID strings depending on Trillet's
      // response shape — extract the _id string in either case.
      const rawNumId = (agent.phoneNumberIds || [])[0];
      const numberId = rawNumId?._id ?? rawNumId ?? null;

      if (numberId) {
        // Release may return 404 for free-plan numbers (Trillet restriction —
        // those must be released via the dashboard). Treat as a non-fatal warning
        // so flow + agent deletion still proceeds and the run doesn't stall.
        try {
          raw.releaseNumber = await this._req('POST', '/twilio/release-number',
            { phoneNumberId: numberId });
        } catch (err) {
          const notFound = err.message?.includes('not found') || err.message?.includes('404');
          if (!notFound) throw err;
          raw.releaseNumber = { skipped: true, reason: 'number not found — may require dashboard release', numberId };
        }
      }
      if (flowId) {
        // Deleting the call-flow cascades to delete the agent on Trillet's side.
        // The subsequent DELETE /agents/{id} will return 500 "not found" — that is
        // expected and treated as success below.
        raw.deleteFlow = await this._req('DELETE', `/call-flows/${flowId}`);
      }

      // Attempt agent deletion; if the flow cascade already removed it, swallow the error.
      try {
        raw.deleteAgent = await this._req('DELETE', `/agents/${accountId}`);
      } catch (err) {
        const alreadyGone = err.message?.includes('not found') ||
                            err.message?.includes('does not belong');
        if (!alreadyGone) throw err;
        raw.deleteAgent = { cascadeDeleted: true };
      }

      return { success: true, raw };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError('deprovision', err.message, err);
    }
  }
}

module.exports = { TrilletVoiceProvider };
