'use strict';

const { VoiceProvider, VoiceProviderError } = require('./interface');

// ---------------------------------------------------------------------------
// Deterministic helpers (exported so tests can pre-compute expected values)
// ---------------------------------------------------------------------------

/**
 * djb2-variant hash of a string → unsigned 32-bit integer.
 * Pure function: same input always produces the same output.
 *
 * @param   {string} str
 * @returns {number}
 */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; // unsigned 32-bit
  }
  return h;
}

/**
 * Derive a deterministic E.164 US phone number from an accountId + area code hint.
 * Same inputs always produce the same number — tests can assert exact values.
 *
 * @param   {string} accountId
 * @param   {{ areaCode?: string }} [req]
 * @returns {string}  e.g. '+15124201337'
 */
function derivePhoneNumber(accountId, req = {}) {
  const area = String(req.areaCode || '555')
    .replace(/\D/g, '')
    .slice(0, 3)
    .padEnd(3, '0');
  const subscriber = String(djb2(accountId) % 10_000_000).padStart(7, '0');
  return `+1${area}${subscriber}`;
}

// ---------------------------------------------------------------------------
// MockVoiceProvider
// ---------------------------------------------------------------------------

/**
 * Fully in-memory VoiceProvider for development and testing.
 * No network calls. No real accounts. Safe to run in CI.
 *
 * ── State inspection ──────────────────────────────────────────────────────
 *   mock._accounts   Map<accountId, AccountState>  — full state per account
 *   mock.calls       Array<CallLogEntry>            — append-only call log
 *
 * ── Failure simulation ───────────────────────────────────────────────────
 *   mock.failOn.add('provisionNumber')    → every call to that method throws
 *   mock.failOn.delete('provisionNumber') → subsequent calls succeed
 *
 *   Also seeded from env:  MOCK_FAIL_METHODS=provisionNumber,applyContentPack
 *
 * ── Resumability testing pattern ────────────────────────────────────────
 *   mock.failOn.add('provisionNumber');
 *   // run pipeline step → catches VoiceProviderError, writes provisioning_step event
 *   mock.failOn.delete('provisionNumber');
 *   // retry step → succeeds; pipeline resumes from checkpoint
 *
 * ── Determinism ─────────────────────────────────────────────────────────
 *   accountId  = 'mock_acct_' + clientConfig.clientId   (directly derived)
 *   phoneNumber = derivePhoneNumber(accountId, req)       (pure hash function)
 *   agentId     = derived from accountId + pack.version   (pure hash)
 *   All are stable across process restarts and independent mock instances.
 *   Export `derivePhoneNumber` and `djb2` so tests can pre-compute expectations.
 */
class MockVoiceProvider extends VoiceProvider {
  constructor() {
    super();

    // Mock auto-provisions a (fake) number so dev/test pipelines complete without
    // the manual-number pause that the real Trillet provider requires.
    this.autoProvisionsNumber = true;

    /**
     * All accounts, keyed by accountId.
     * Each entry shape:
     * {
     *   clientConfig:    ClientConfig,
     *   phoneNumber:     string|null,
     *   numberId:        string|null,
     *   contentPack:     ContentPack|null,
     *   config:          object,        // live config, mutated by updateConfig
     *   testCalls:       Array<{callId, toNumber, latencyMs, at: Date}>,
     *   deprovisioned:   boolean,
     *   deprovisionedAt: Date|null,
     *   createdAt:       Date,
     * }
     * @type {Map<string, object>}
     */
    this._accounts = new Map();

    /**
     * Append-only log of every method call — successes and failures both recorded.
     * Each entry: { method, args, result?, error?, at: Date }
     * @type {Array<object>}
     */
    this.calls = [];

    /**
     * Methods in this Set throw VoiceProviderError when called.
     * Add/remove entries at any time to control failure scenarios.
     * Pre-populated from MOCK_FAIL_METHODS env var (comma-separated method names).
     * @type {Set<string>}
     */
    this.failOn = new Set(
      (process.env.MOCK_FAIL_METHODS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Check failOn, then validate accountId if provided.
   * Throws VoiceProviderError on any guard violation.
   * @param {string}           method
   * @param {string|undefined} [accountId]
   */
  _guard(method, accountId) {
    if (this.failOn.has(method)) {
      throw new VoiceProviderError(
        method,
        `[mock] simulated failure (failOn.has('${method}'))`
      );
    }
    if (accountId !== undefined) {
      const acct = this._accounts.get(accountId);
      if (!acct) {
        throw new VoiceProviderError(method, `[mock] unknown accountId: ${accountId}`);
      }
      if (acct.deprovisioned) {
        throw new VoiceProviderError(
          method,
          `[mock] account already deprovisioned: ${accountId}`
        );
      }
    }
  }

  /**
   * Log a successful call and return its result.
   * @template T
   * @param {string}   method
   * @param {unknown[]} args
   * @param {T}        result
   * @returns {T}
   */
  _log(method, args, result) {
    this.calls.push({ method, args, result, at: new Date() });
    return result;
  }

  /**
   * Wrap err as VoiceProviderError if needed, log it, then re-throw.
   * @param {string}   method
   * @param {unknown[]} args
   * @param {unknown}  err
   * @returns {never}
   */
  _fail(method, args, err) {
    const vpe =
      err instanceof VoiceProviderError
        ? err
        : new VoiceProviderError(method, /** @type {Error} */ (err).message, err);
    this.calls.push({ method, args, error: vpe, at: new Date() });
    throw vpe;
  }

  // --------------------------------------------------------------------------
  // Interface implementation
  // --------------------------------------------------------------------------

  /** @param {import('./interface').ClientConfig} clientConfig */
  async createSubAccount(clientConfig) {
    try {
      this._guard('createSubAccount');
      const accountId = `mock_acct_${clientConfig.clientId}`;
      this._accounts.set(accountId, {
        clientConfig,
        phoneNumber:     null,
        numberId:        null,
        contentPack:     null,
        config: {
          forwardToNumber:    clientConfig.forwardToNumber,
          tone:               clientConfig.tone,
          businessHours:      clientConfig.businessHours,
          doNotSay:           clientConfig.doNotSay,
          escalationKeywords: clientConfig.escalationKeywords,
          afterHoursBehavior: clientConfig.afterHoursBehavior,
        },
        testCalls:       [],
        deprovisioned:   false,
        deprovisionedAt: null,
        createdAt:       new Date(),
      });
      return this._log('createSubAccount', [clientConfig], {
        accountId,
        raw: { mock: true, op: 'createSubAccount', accountId },
      });
    } catch (err) {
      return this._fail('createSubAccount', [clientConfig], err);
    }
  }

  /**
   * @param {string} accountId
   * @param {import('./interface').NumberRequest} [req]
   */
  async provisionNumber(accountId, req = {}) {
    try {
      this._guard('provisionNumber', accountId);
      const acct = this._accounts.get(accountId);
      const phoneNumber = derivePhoneNumber(accountId, req);
      const numberId = `mock_num_${djb2(accountId) % 100_000}`;
      acct.phoneNumber = phoneNumber;
      acct.numberId = numberId;
      return this._log('provisionNumber', [accountId, req], {
        phoneNumber,
        numberId,
        raw: { mock: true, op: 'provisionNumber', accountId, phoneNumber, numberId },
      });
    } catch (err) {
      return this._fail('provisionNumber', [accountId, req], err);
    }
  }

  /**
   * @param {string} accountId
   * @param {import('./interface').ContentPack} pack
   */
  async applyContentPack(accountId, pack) {
    try {
      this._guard('applyContentPack', accountId);
      const acct = this._accounts.get(accountId);
      acct.contentPack = pack;
      // Merge pack into live config (atomic replacement of pack-owned fields)
      Object.assign(acct.config, {
        tone:               pack.tone,
        businessHours:      pack.businessHours,
        doNotSay:           pack.doNotSay,
        escalationKeywords: pack.escalationKeywords,
        afterHoursBehavior: pack.afterHoursBehavior,
        forwardToNumber:    pack.forwardToNumber,
      });
      // Deterministic agentId: stable for same account + pack version
      const agentId = `mock_agent_${djb2(accountId + pack.version) % 100_000}`;
      return this._log('applyContentPack', [accountId, pack], {
        success: true,
        agentId,
        raw: { mock: true, op: 'applyContentPack', accountId, version: pack.version, agentId },
      });
    } catch (err) {
      return this._fail('applyContentPack', [accountId, pack], err);
    }
  }

  /**
   * @param {string} accountId
   * @param {import('./interface').ConfigDelta} delta
   */
  async updateConfig(accountId, delta) {
    try {
      this._guard('updateConfig', accountId);
      const acct = this._accounts.get(accountId);
      Object.assign(acct.config, delta);
      return this._log('updateConfig', [accountId, delta], {
        success: true,
        raw: { mock: true, op: 'updateConfig', accountId, delta },
      });
    } catch (err) {
      return this._fail('updateConfig', [accountId, delta], err);
    }
  }

  /**
   * @param {string} accountId
   * @param {string} toNumber
   */
  async runTestCall(accountId, toNumber) {
    try {
      this._guard('runTestCall', accountId);
      const acct = this._accounts.get(accountId);
      // Sequence-based callId: deterministic even across multiple calls
      const seq = acct.testCalls.length;
      const callId = `mock_call_${djb2(accountId + String(seq)) % 1_000_000}`;
      // Latency in 100–299ms range, deterministic per account + toNumber
      const latencyMs = 100 + (djb2(accountId + toNumber) % 200);
      acct.testCalls.push({ callId, toNumber, latencyMs, at: new Date() });
      return this._log('runTestCall', [accountId, toNumber], {
        success: true,
        callId,
        latencyMs,
        raw: { mock: true, op: 'runTestCall', accountId, toNumber, callId, latencyMs },
      });
    } catch (err) {
      return this._fail('runTestCall', [accountId, toNumber], err);
    }
  }

  /** @param {string} accountId */
  async deprovision(accountId) {
    try {
      this._guard('deprovision', accountId);
      const acct = this._accounts.get(accountId);
      acct.deprovisioned   = true;
      acct.deprovisionedAt = new Date();
      return this._log('deprovision', [accountId], {
        success: true,
        raw: { mock: true, op: 'deprovision', accountId },
      });
    } catch (err) {
      return this._fail('deprovision', [accountId], err);
    }
  }
}

module.exports = { MockVoiceProvider, derivePhoneNumber, djb2 };
