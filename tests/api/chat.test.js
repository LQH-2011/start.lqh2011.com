/* Unit tests for the AI chat API (api/chat.js, api/chat-sessions.js,
   api/chat-messages.js, api/_chat.js) with NO database. Like api.test.js,
   the DB-dependent paths are exercised only up to the auth gate + error
   handling (unreachable DATABASE_URL -> 500 db_error deterministically).

   The streaming success path (provider proxy + DB persist) is NOT covered
   here — it needs a live Postgres + a provider; it is validated manually via
   `npm run dev`. The SSE/NDJSON parsing *helpers* (parseProviderLine,
   deriveTitle, validId) are pure and are the unit-tested part.

   Run with: npm run test:api   (node --test tests/api/) */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

/* ---------- env (must be set before requiring the handlers) ---------- */
process.env.AUTH_PASSWORD_HASH = makeHash('correct-password');
process.env.AUTH_TOKEN_SECRET = 'test-token-secret';
process.env.ALLOWED_ORIGIN = 'https://start.lqh2011.com, https://preview.lqh2011.com';
process.env.DATABASE_URL = 'postgres://ci:***@127.0.0.1:1/cidb';
/* deliberately NOT setting AI_BASE_URL / AI_MODEL / AI_API_KEY here so the
   handlers take the ai_not_configured path (tested below) */

const lib = require('../../api/_lib.js');
const chat = require('../../api/_chat.js');
const chatHandler = require('../../api/chat.js');
const chatSessionsHandler = require('../../api/chat-sessions.js');
const chatMessagesHandler = require('../../api/chat-messages.js');

function makeHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function makeRes() {
  const out = { headers: {}, statusCode: null, body: null };
  out.setHeader = (k, v) => { out.headers[k] = v; };
  out.status = (code) => ({
    json: (obj) => { out.statusCode = code; out.body = obj; }
  });
  return out;
}

function makeReq(over) {
  return Object.assign({ method: 'GET', headers: {}, body: {} }, over);
}

const ORIGIN = 'https://start.lqh2011.com';
const AUTH = { authorization: 'Bearer ' + lib.signToken() };

/* keep expected DB-error noise out of the output */
const origConsoleError = console.error;
test.beforeEach(() => { console.error = () => {}; });
test.afterEach(() => { console.error = origConsoleError; });

/* ================= pure helpers (api/_chat.js) ================= */

test('parseProviderLine: content deltas, [DONE], error, and garbage', () => {
  assert.deepEqual(chat.parseProviderLine('data: {"choices":[{"delta":{"content":"Hello"}}]}'),
    { type: 'delta', text: 'Hello' });
  assert.deepEqual(chat.parseProviderLine('data: [DONE]'), { type: 'done' });
  assert.deepEqual(chat.parseProviderLine('data: {"error":{"message":"bad"}}'),
    { type: 'error', status: 'ai_error' });
  assert.equal(chat.parseProviderLine(''), null);
  assert.equal(chat.parseProviderLine('not-sse'), null);
  assert.equal(chat.parseProviderLine('data: '), null);
  assert.equal(chat.parseProviderLine('data: {"choices":[]}'), null);
  /* a delta with empty content is ignored (finish_reason-only chunks) */
  assert.equal(chat.parseProviderLine('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}'), null);
  /* an inline unescaped quote is not valid JSON -> null, never a crash */
  assert.equal(chat.parseProviderLine('data: {"delta":"broken'), null);
});

test('deriveTitle: single line, whitespace collapsed, truncated with ellipsis', () => {
  assert.equal(chat.deriveTitle('  hello\nworld  '), 'hello world');
  assert.equal(chat.deriveTitle('x'), 'x');
  const long = 'a'.repeat(100);
  const t = chat.deriveTitle(long);
  assert.ok(t.length <= 48 + 1);          /* 48 chars + ellipsis */
  assert.ok(t.endsWith('…'));
  /* the ellipsis never breaks a word mid-air */
  assert.equal(chat.deriveTitle('hello world this is a long message'), 'hello world this is a long message');
});

test('validId: accepts server-style ids, rejects empty/garbage/oversized', () => {
  assert.equal(chat.validId('abc-123_xyz'), true);
  assert.equal(chat.validId(''), false);
  assert.equal(chat.validId(null), false);
  assert.equal(chat.validId('a'.repeat(65)), false);
  assert.equal(chat.validId('has space'), false);
  assert.equal(chat.validId('bad;id'), false);
  assert.equal(chat.validId(42), false);
});

/* ================= api/chat.js ================= */

test('chat: requires a valid bearer token (401) and allows OPTIONS preflight', async () => {
  const noAuth = makeRes();
  await chatHandler(makeReq({ method: 'POST', body: { message: 'hi' } }), noAuth);
  assert.equal(noAuth.statusCode, 401);
  assert.equal(noAuth.body.error, 'unauthorized');

  const bad = makeRes();
  await chatHandler(makeReq({ method: 'POST', headers: { authorization: 'Bearer garbage' }, body: { message: 'hi' } }), bad);
  assert.equal(bad.statusCode, 401);

  const pre = makeRes();
  await chatHandler(makeReq({ method: 'OPTIONS', headers: { origin: ORIGIN } }), pre);
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers['Access-Control-Allow-Origin'], ORIGIN);
});

test('chat: wrong method 405; missing/empty/oversized message 400', async () => {
  const m = makeRes();
  await chatHandler(makeReq({ method: 'GET', headers: AUTH }), m);
  assert.equal(m.statusCode, 405);

  const missing = makeRes();
  await chatHandler(makeReq({ method: 'POST', headers: AUTH, body: {} }), missing);
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.error, 'missing_message');

  const empty = makeRes();
  await chatHandler(makeReq({ method: 'POST', headers: AUTH, body: { message: '   ' } }), empty);
  assert.equal(empty.statusCode, 400);

  const long = makeRes();
  await chatHandler(makeReq({ method: 'POST', headers: AUTH, body: { message: 'x'.repeat(20001) } }), long);
  assert.equal(long.statusCode, 400);
  assert.equal(long.body.error, 'message_too_long');
});

test('chat: AI not configured -> 500 ai_not_configured (env absent)', async () => {
  const res = makeRes();
  await chatHandler(makeReq({ method: 'POST', headers: AUTH, body: { message: 'hello' } }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'ai_not_configured');
});

/* ================= api/chat-sessions.js ================= */

test('chat-sessions: requires auth; DELETE validates id; DB unreachable -> 500', async () => {
  const noAuth = makeRes();
  await chatSessionsHandler(makeReq({ method: 'GET' }), noAuth);
  assert.equal(noAuth.statusCode, 401);

  const pre = makeRes();
  await chatSessionsHandler(makeReq({ method: 'OPTIONS', headers: { origin: ORIGIN } }), pre);
  assert.equal(pre.statusCode, 204);

  const badId = makeRes();
  await chatSessionsHandler(makeReq({ method: 'DELETE', headers: AUTH, url: '/api/chat-sessions?id=;rm' }), badId);
  assert.equal(badId.statusCode, 400);
  assert.equal(badId.body.error, 'bad_id');

  /* valid auth + valid id -> the DB is unreachable -> 500 db_error */
  const dbErr = makeRes();
  await chatSessionsHandler(makeReq({ method: 'DELETE', headers: AUTH, url: '/api/chat-sessions?id=abc-123' }), dbErr);
  assert.equal(dbErr.statusCode, 500);
  assert.equal(dbErr.body.error, 'db_error');

  const getErr = makeRes();
  await chatSessionsHandler(makeReq({ method: 'GET', headers: AUTH }), getErr);
  assert.equal(getErr.statusCode, 500);
  assert.equal(getErr.body.error, 'db_error');
});

/* ================= api/chat-messages.js ================= */

test('chat-messages: requires auth; GET/DELETE validate ids and gate to 500', async () => {
  const noAuth = makeRes();
  await chatMessagesHandler(makeReq({ method: 'GET', url: '/api/chat-messages?session=abc' }), noAuth);
  assert.equal(noAuth.statusCode, 401);

  const badSession = makeRes();
  await chatMessagesHandler(makeReq({ method: 'GET', headers: AUTH, url: '/api/chat-messages?session=bad id' }), badSession);
  assert.equal(badSession.statusCode, 400);

  const badDel = makeRes();
  await chatMessagesHandler(makeReq({ method: 'DELETE', headers: AUTH, url: '/api/chat-messages?id=;rm' }), badDel);
  assert.equal(badDel.statusCode, 400);

  /* GET with a valid session -> DB unreachable -> 500 */
  const getErr = makeRes();
  await chatMessagesHandler(makeReq({ method: 'GET', headers: AUTH, url: '/api/chat-messages?session=abc-123' }), getErr);
  assert.equal(getErr.statusCode, 500);
  assert.equal(getErr.body.error, 'db_error');
});

test('chat-messages: POST regenerate requires AI config + valid body', async () => {
  /* AI not configured -> 500 before any DB/streaming */
  const notCfg = makeRes();
  await chatMessagesHandler(makeReq({ method: 'POST', headers: AUTH, body: { sessionId: 'abc-123', assistantMessageId: 'msg-1' } }), notCfg);
  assert.equal(notCfg.statusCode, 500);
  assert.equal(notCfg.body.error, 'ai_not_configured');

  /* with AI configured, a malformed body -> 400 */
  const prevBase = process.env.AI_BASE_URL, prevModel = process.env.AI_MODEL, prevKey = process.env.AI_API_KEY;
  process.env.AI_BASE_URL = 'https://api.example.com/v1';
  process.env.AI_MODEL = 'test-model';
  process.env.AI_API_KEY = 'test-key';
  try {
    const badBody = makeRes();
    await chatMessagesHandler(makeReq({ method: 'POST', headers: AUTH, body: { sessionId: 'x', assistantMessageId: 'bad id' } }), badBody);
    assert.equal(badBody.statusCode, 400);
    assert.equal(badBody.body.error, 'bad_body');
  } finally {
    if (prevBase === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = prevBase;
    if (prevModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = prevModel;
    if (prevKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = prevKey;
  }
});
