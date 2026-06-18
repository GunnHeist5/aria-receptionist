// @ts-check
'use strict';

/**
 * @fileoverview VoiceProvider — the single isolated seam for all voice-vendor interaction.
 *
 * Design rules (enforced by convention):
 *   1. The rest of the system imports ONLY from ./index.js (createVoiceProvider).
 *      It never imports MockVoiceProvider or TrilletVoiceProvider directly.
 *   2. All six methods throw VoiceProviderError on failure.
 *      Callers must catch and write a `provisioning_step` event
 *      ({ type: 'provisioning_step', payload: { step, error, ... } }) to the events table.
 *      NEVER use `payment_failed` for voice provisioning failures —
 *      that event type is reserved exclusively for Stripe/billing concerns.
 *   3. The `raw` field on every result holds the full provider response.
 *      Callers should store it in events.payload for debugging without the
 *      adapter needing to know the DB schema.
 *   4. To swap providers: set VOICE_PROVIDER=<impl> and implement VoiceProvider.
 *      Zero other code changes required.
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ClientConfig
 * Everything the provider needs to stand up a receptionist for one client.
 * Sourced directly from the `clients` row; contains no provider-specific fields.
 *
 * @property {string}   clientId              Our DB uuid — logged only, not sent to provider
 * @property {string}   businessName
 * @property {string}   businessType          e.g. 'plumbing'
 * @property {string}   forwardToNumber       E.164 — live calls forwarded here
 * @property {string}   tone                  'professional'|'friendly'|'casual'|'formal'
 * @property {Object}   businessHours         e.g. { "mon-fri": "08:00-18:00", "sat": "09:00-13:00" }
 * @property {string[]} servicesOffered
 * @property {Object}   serviceArea           e.g. { radius_miles: 25, zips: [...] }
 * @property {string[]} doNotSay
 * @property {string[]} escalationKeywords
 * @property {string}   afterHoursBehavior    'voicemail'|'forward'|'ai_message'|'emergency_only'
 * @property {Object}   alertDestination      e.g. { sms: ['+1...'], email: ['...'] }
 */

/**
 * @typedef {Object} NumberRequest
 * Hints for phone number provisioning; all fields optional.
 * @property {string} [areaCode]   Preferred area code, e.g. '512'
 * @property {string} [state]      Fallback state preference, e.g. 'TX'
 */

/**
 * @typedef {Object} ContentPack
 * A versioned bundle of prompt + personality config applied atomically to an agent.
 * Version string is written to clients.content_pack_version on success.
 *
 * @property {string}   version              e.g. 'plumbing-v3'
 * @property {string}   systemPrompt
 * @property {string}   greeting
 * @property {string}   tone
 * @property {string[]} doNotSay
 * @property {string[]} escalationKeywords
 * @property {string}   afterHoursBehavior
 * @property {Object}   businessHours
 * @property {string}   forwardToNumber
 */

/**
 * @typedef {Object} ConfigDelta
 * Partial live update — only the fields that changed.
 * Applied to a running agent without re-provisioning the phone number.
 *
 * @property {string}   [forwardToNumber]
 * @property {Object}   [businessHours]
 * @property {string[]} [doNotSay]
 * @property {string[]} [escalationKeywords]
 * @property {string}   [afterHoursBehavior]
 * @property {string}   [tone]
 */

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SubAccountResult
 * @property {string} accountId  Written to clients.voice_provider_account_id
 * @property {Object} raw        Full provider response (log in events.payload)
 */

/**
 * @typedef {Object} NumberResult
 * @property {string}  phoneNumber  E.164. Written to clients.provisioned_number
 * @property {string}  [numberId]   Provider's internal identifier for the number
 * @property {Object}  raw
 */

/**
 * @typedef {Object} ApplyResult
 * @property {boolean} success
 * @property {string}  [agentId]   Provider's agent identifier (store for future updateConfig)
 * @property {Object}  raw
 */

/**
 * @typedef {Object} UpdateResult
 * @property {boolean} success
 * @property {Object}  raw
 */

/**
 * @typedef {Object} TestCallResult
 * @property {boolean} success
 * @property {string}  [callId]
 * @property {number}  [latencyMs]
 * @property {Object}  raw
 */

/**
 * @typedef {Object} DeprovisionResult
 * @property {boolean} success
 * @property {Object}  raw
 */

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown by every VoiceProvider method on failure.
 * Callers distinguish voice failures from other errors via instanceof check,
 * then write a `provisioning_step` event (never `payment_failed`) to the DB.
 */
class VoiceProviderError extends Error {
  /**
   * @param {string}  method   The interface method that failed, e.g. 'provisionNumber'
   * @param {string}  message
   * @param {unknown} [cause]  Original error if wrapping
   */
  constructor(method, message, cause) {
    super(`[VoiceProvider.${method}] ${message}`);
    this.name = 'VoiceProviderError';
    this.method = method;
    this.cause = cause ?? null;
  }
}

// ---------------------------------------------------------------------------
// Abstract base class — documents the interface; throws on every method
// ---------------------------------------------------------------------------

class VoiceProvider {
  /**
   * Create a sub-account for a new client in the voice provider's platform.
   * On success: write clients.voice_provider + clients.voice_provider_account_id.
   *
   * @param   {ClientConfig} clientConfig
   * @returns {Promise<SubAccountResult>}
   * @throws  {VoiceProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async createSubAccount(clientConfig) {
    throw new VoiceProviderError('createSubAccount', 'not implemented');
  }

  /**
   * Provision a phone number on an existing sub-account.
   * On success: write clients.provisioned_number.
   *
   * @param   {string}        accountId  clients.voice_provider_account_id
   * @param   {NumberRequest} req
   * @returns {Promise<NumberResult>}
   * @throws  {VoiceProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async provisionNumber(accountId, req) {
    throw new VoiceProviderError('provisionNumber', 'not implemented');
  }

  /**
   * Apply a versioned content pack to an agent (initial config or upgrade).
   * Must replace atomically — re-applying the same pack must be idempotent.
   * On success: write clients.content_pack_version.
   *
   * @param   {string}      accountId
   * @param   {ContentPack} pack
   * @returns {Promise<ApplyResult>}
   * @throws  {VoiceProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async applyContentPack(accountId, pack) {
    throw new VoiceProviderError('applyContentPack', 'not implemented');
  }

  /**
   * Push a partial config change to a running agent without re-provisioning.
   *
   * @param   {string}      accountId
   * @param   {ConfigDelta} delta
   * @returns {Promise<UpdateResult>}
   * @throws  {VoiceProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async updateConfig(accountId, delta) {
    throw new VoiceProviderError('updateConfig', 'not implemented');
  }

  /**
   * Trigger a test call to verify the agent is live and responding correctly.
   *
   * @param   {string} accountId
   * @param   {string} toNumber   E.164 number to call for the test
   * @returns {Promise<TestCallResult>}
   * @throws  {VoiceProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async runTestCall(accountId, toNumber) {
    throw new VoiceProviderError('runTestCall', 'not implemented');
  }

  /**
   * Release the provisioned number and delete the sub-account.
   * Irreversible. Call only on churn / deprovision workflow.
   *
   * @param   {string} accountId
   * @returns {Promise<DeprovisionResult>}
   * @throws  {VoiceProviderError}
   */
  // eslint-disable-next-line no-unused-vars
  async deprovision(accountId) {
    throw new VoiceProviderError('deprovision', 'not implemented');
  }
}

module.exports = { VoiceProvider, VoiceProviderError };
