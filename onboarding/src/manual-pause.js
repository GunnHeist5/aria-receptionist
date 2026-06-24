'use strict';

/**
 * Control-flow signal (NOT a real error) thrown by the provision_number step in
 * manual-number mode when the number hasn't been bought + attached yet.
 *
 * The pipeline catches it and pauses cleanly — the run stays resumable and the
 * client stays in 'provisioning' (not 'failed', not 'live') — so the owner can
 * buy + attach the number in the Trillet dashboard, then resume to finish.
 */
class ManualNumberPause extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManualNumberPause';
    this.isManualPause = true;
  }
}

module.exports = { ManualNumberPause };
