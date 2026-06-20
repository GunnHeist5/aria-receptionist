'use strict';
const TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const OWNER  = process.env.TELEGRAM_OWNER_CHAT_ID;
const BASE   = `https://api.telegram.org/bot${TOKEN}`;

async function send(chatId, text, replyMarkup = null) {
  const body = { chat_id: String(chatId), text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`${BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('[telegram] sendMessage failed:', await res.text());
  return res.json();
}

async function sendToOwner(text, replyMarkup = null) {
  if (!OWNER) { console.error('[telegram] TELEGRAM_OWNER_CHAT_ID not set'); return; }
  return send(OWNER, text, replyMarkup);
}

function approvalKeyboard(type, id) {
  return {
    inline_keyboard: [[
      { text: '✓ Approve', callback_data: `approve:${type}:${id}` },
      { text: '✗ Deny',    callback_data: `deny:${type}:${id}`    },
    ]],
  };
}

async function answerCallback(callbackQueryId, text = 'Done') {
  await fetch(`${BASE}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// Call once to register our Next.js endpoint as the Telegram webhook.
async function registerWebhook(baseUrl) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const url    = `${baseUrl}/api/webhooks/telegram${secret ? `?secret=${secret}` : ''}`;
  const res = await fetch(`${BASE}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, drop_pending_updates: true }),
  });
  return res.json();
}

module.exports = { send, sendToOwner, approvalKeyboard, answerCallback, registerWebhook };
