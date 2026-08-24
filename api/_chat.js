/* Shared helpers for the AI chat API (api/chat.js, api/chat-sessions.js,
   api/chat-messages.js). Reuses _lib for auth/CORS/DB.

   Auth: every chat route requires the same `Authorization: Bearer <token>`
   as /api/data. AI credentials come from env vars the user sets in Vercel:
     AI_BASE_URL   OpenAI-compatible base, e.g. https://api.deepseek.com/v1
     AI_MODEL      model name, e.g. deepseek-chat
     AI_API_KEY    the provider's API key
   The chat route proxies an OpenAI-compatible /chat/completions call and
   streams the reply back as NDJSON lines (see chat.js). */
'use strict';

var crypto = require('crypto');

/* A bearer-token gate shared by all chat routes. Sends 401 and returns
   false when the token is missing/invalid; otherwise returns true. */
function requireAuth(req, res, lib) {
  var tok = lib.bearerToken(req);
  if (!tok || !lib.verifyToken(tok)) {
    lib.send(res, 401, { error: 'unauthorized' }, req);
    return false;
  }
  return true;
}

/* NDJSON stream line: one JSON object per line. */
function jsonLine(obj) {
  return JSON.stringify(obj) + '\n';
}

/* A session title derives from the first user message — the leading text,
   collapsed to a single line and capped. */
function deriveTitle(message) {
  var t = String(message).replace(/\s+/g, ' ').trim();
  if (t.length > 48) { t = t.slice(0, 48).replace(/\s+\S*$/, '') + '…'; }
  return t;
}

/* Crypto-random id for sessions/messages. */
function uuid() {
  return crypto.randomUUID();
}

/* Session ids are only ever created by this server (uuid), so accept a
   conservative charset + length. Prevents a crafted id hitting the DB gluing
   arbitrary strings into the key. */
function validId(id) {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(id);
}

/* Parse one line of an OpenAI-compatible SSE stream. Returns:
   { type: 'delta', text: '...' } for a content chunk,
   { type: 'error', status } when the chunk carries an error,
   null for anything else (including the [DONE] sentinel). Pure + testable. */
function parseProviderLine(line) {
  var trimmed = line.trim();
  if (!trimmed || trimmed.indexOf('data:') !== 0) return null;
  var data = trimmed.slice(5).trim();
  if (data === '') return null;
  if (data === '[DONE]') return { type: 'done' };
  var obj;
  try { obj = JSON.parse(data); } catch (e) { return null; }
  if (obj && obj.error) return { type: 'error', status: obj.error.code || 'ai_error' };
  if (obj && obj.choices && obj.choices[0]) {
    var delta = obj.choices[0].delta && obj.choices[0].delta.content;
    if (typeof delta === 'string' && delta.length > 0) return { type: 'delta', text: delta };
  }
  return null;
}

/* OpenAI-compatible chat completions URL from AI_BASE_URL. */
function providerUrl() {
  var base = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  return base + '/chat/completions';
}
function aiConfigured() {
  return !!(process.env.AI_BASE_URL && process.env.AI_MODEL && process.env.AI_API_KEY);
}

/* Export the AI config so a route can fail fast before touching the DB. */
module.exports = {
  requireAuth: requireAuth,
  jsonLine: jsonLine,
  deriveTitle: deriveTitle,
  uuid: uuid,
  validId: validId,
  parseProviderLine: parseProviderLine,
  providerUrl: providerUrl,
  aiConfigured: aiConfigured
};
