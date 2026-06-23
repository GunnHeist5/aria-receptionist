'use strict';
// Example test — proves the harness works and shows the pattern.
// Run all tests with: npm test   (which runs `node --test tests/`)
const { test } = require('node:test');
const assert = require('node:assert/strict');

const tg = require('../sales-manager/lib/telegram.js');

test('approvalKeyboard builds approve/deny callback data', () => {
  const kb = tg.approvalKeyboard('onboard', 'abc123');
  const [approve, deny] = kb.inline_keyboard[0];
  assert.equal(approve.callback_data, 'approve:onboard:abc123');
  assert.equal(deny.callback_data, 'deny:onboard:abc123');
});

test('approvalKeyboard labels are present', () => {
  const kb = tg.approvalKeyboard('candidate', 'x');
  assert.ok(kb.inline_keyboard[0][0].text.length > 0);
  assert.ok(kb.inline_keyboard[0][1].text.length > 0);
});
