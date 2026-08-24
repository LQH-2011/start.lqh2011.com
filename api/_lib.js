/* Shared helpers for the start.lqh2011.com sync API (Vercel functions).
   Env vars (set in Vercel / local .env):
     DATABASE_URL         Neon Postgres connection string (pooled recommended)
     AUTH_PASSWORD_HASH   scrypt$<salt_hex>$<hash_hex> — generate with
                          `npm run hash` (scripts/hash-password.js)
     AUTH_TOKEN_SECRET    random hex used to HMAC-sign session tokens
     ALLOWED_ORIGIN       CORS origin, default https://start.lqh2011.com
   No framework, CommonJS so Vercel bundles it with zero config. */
'use strict';

var crypto = require('crypto');
var pg = require('pg');

var TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; /* 90 days */
var AUTH_WINDOW_MS = 15 * 60 * 1000;
var AUTH_MAX_ATTEMPTS = 10;

/* ---------- CORS ---------- */
/* ALLOWED_ORIGIN is a comma-separated list of origins allowed to call the
   API (default: the production page origin). The response echoes the
   request's Origin header only when it is on the list — never '*', and never
   an origin outside the list — so one env var can serve both the production
   page and preview.lqh2011.com, and the browser's preflight check passes for
   exactly the allowed origins. */
function allowedOrigins() {
  var v = process.env.ALLOWED_ORIGIN;
  if (!v || !v.trim()) return ['https://start.lqh2011.com'];
  return v.split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}
function corsOrigin(req) {
  var origin = req.headers && req.headers.origin;
  if (!origin) return null;
  var list = allowedOrigins();
  for (var i = 0; i < list.length; i++) {
    if (list[i] === origin) return origin;
  }
  return null;
}
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}
/* Set CORS headers only when the request origin is allowed; otherwise no
   ACAO header is set and the browser blocks the call. */
function applyCors(res, req) {
  var origin = corsOrigin(req);
  if (!origin) return false;
  var headers = corsHeaders(origin);
  Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
  return true;
}
function send(res, status, obj, req) {
  applyCors(res, req);
  res.status(status).json(obj);
}
/* OPTIONS preflight for cross-origin fetches (page on GH Pages / Vercel
   preview, API on Vercel). */
function preflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  send(res, 204, {}, req);
  return true;
}

/* ---------- password ---------- */
/* AUTH_PASSWORD_HASH = scrypt$<salt_hex>$<hash_hex>; scryptSync defaults
   (N=16384, r=8, p=1) — strong enough for a single-user personal API. */
function verifyPassword(password) {
  var stored = process.env.AUTH_PASSWORD_HASH || '';
  var parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  var salt;
  var expected;
  try {
    salt = Buffer.from(parts[1], 'hex');
    expected = Buffer.from(parts[2], 'hex');
  } catch (e) { return false; }
  if (salt.length === 0 || expected.length === 0) return false;
  var actual = crypto.scryptSync(String(password), salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/* ---------- session tokens (stateless HMAC) ---------- */
/* Token = base64url(payload) + '.' + base64url(hmac). Payload {sub, exp}.
   Fail closed when AUTH_TOKEN_SECRET is missing: an empty HMAC key would let
   anyone forge a token, so signToken refuses to mint and verifyToken rejects. */
function tokenSecret() {
  var secret = process.env.AUTH_TOKEN_SECRET;
  return (typeof secret === 'string' && secret.length > 0) ? secret : null;
}
function signToken() {
  var secret = tokenSecret();
  if (!secret) throw new Error('AUTH_TOKEN_SECRET is required');
  var payload = Buffer.from(JSON.stringify({ sub: 'owner', exp: Date.now() + TOKEN_TTL_MS }))
    .toString('base64url');
  var sig = crypto.createHmac('sha256', secret)
    .update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(tok) {
  var secret = tokenSecret();
  if (!secret) return null;
  if (!tok || typeof tok !== 'string') return null;
  var parts = tok.split('.');
  if (parts.length !== 2) return null;
  var expected = crypto.createHmac('sha256', secret)
    .update(parts[0]).digest('base64url');
  var a = Buffer.from(parts[1]);
  var b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  var payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch (e) { return null; }
  if (!payload || payload.sub !== 'owner' || typeof payload.exp !== 'number' ||
      payload.exp < Date.now()) return null;
  return payload;
}
function bearerToken(req) {
  var h = req.headers && req.headers.authorization;
  if (!h) return null;
  var m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/* ---------- auth rate limit (per-lambda-instance, best effort) ---------- */
/* Only FAILURES count: the owner mistyping 10x must not be locked out of
   their own page, and a correct password always clears the counter. */
var attempts = new Map();
function rateRec(req) {
  var ip = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'unknown';
  var now = Date.now();
  var rec = attempts.get(ip);
  if (!rec || rec.resetAt <= now) {
    rec = { count: 0, resetAt: now + AUTH_WINDOW_MS };
    attempts.set(ip, rec);
  }
  return rec;
}
/* record a failed attempt; true when the IP is now over the limit */
function recordFailure(req) {
  var rec = rateRec(req);
  rec.count += 1;
  return rec.count > AUTH_MAX_ATTEMPTS;
}
function clearRateLimit(req) {
  var ip = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'unknown';
  attempts.delete(ip);
}

/* ---------- kv store ---------- */
var pool = null;
function getPool() {
  if (!pool) {
    /* Verify Neon's TLS certificate by default (publicly trusted certs).
       Local dev against a self-signed Postgres opts out via
       PGSSL_REJECT_UNAUTHORIZED=false in .env (gitignored). max:1 keeps
       per-instance connections tiny.
       NOTE (CodeRabbit PR #31): an explicit `ssl` object always OVERRIDES
       sslmode derived from the connection string — verified empirically on
       pg 8.13.1 / pg-connection-string 2.14.0 (require/no-verify both lose
       to the explicit object). If pg's resolution ever changes, revisit. */
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
      max: 1,
      connectionTimeoutMillis: 5000
    });
  }
  return pool;
}
async function getAll() {
  var res = await getPool().query('SELECT key, value, updated_at FROM kv');
  var items = {};
  res.rows.forEach(function (r) { items[r.key] = { v: r.value, ts: Number(r.updated_at) }; });
  return items;
}
/* Upsert with server-side last-write-wins: an older timestamp never
   overwrites a newer one (protects against a stale offline device).
   Deletes are TOMBSTONES (NULL value) with the same LWW predicate — a
   physical DELETE would let a stale delete kill a newer value, and let a
   stale value re-INSERT (no row to conflict with) after a newer delete. */
async function upsertAll(items) {
  var client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (var key in items) {
      var it = items[key];
      var value = (it === null || it.v === null || it.v === undefined) ? null : String(it.v);
      await client.query(
        'INSERT INTO kv (key, value, updated_at) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at ' +
        'WHERE kv.updated_at < EXCLUDED.updated_at',
        [key, value, Number(it.ts)]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (e2) {}
    throw e;
  } finally {
    client.release();
  }
}

/* ---------- AI chat store ---------- */
/* Single-user chat history: sessions + messages. All timestamps are ms.
   The chat API is authenticated with the same bearer token as /api/data. */

/* Look up one session (id, title, created_at, updated_at) or null. */
async function getChatSession(id) {
  if (!id) return null;
  var res = await getPool().query('SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = $1', [id]);
  return res.rows.length ? res.rows[0] : null;
}
/* Create a session (idempotent-ish: an existing id just wins). */
async function createChatSession(id, title, now) {
  await getPool().query(
    'INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES ($1, $2, $3, $3) ' +
    'ON CONFLICT (id) DO NOTHING',
    [id, title, now]
  );
}
/* List sessions newest-first, each with the last message's content as a
   preview for the sidebar. */
async function listChatSessions() {
  var res = await getPool().query(
    'SELECT s.id, s.title, s.created_at, s.updated_at, m.content AS last_message ' +
    'FROM chat_sessions s ' +
    'LEFT JOIN LATERAL (' +
    '  SELECT content FROM chat_messages WHERE session_id = s.id ' +
    '  ORDER BY created_at DESC, id DESC LIMIT 1' +
    ') m ON true ' +
    'ORDER BY s.updated_at DESC'
  );
  return res.rows;
}
/* All messages of a session, in thread order. */
async function getChatMessages(sessionId) {
  var res = await getPool().query(
    'SELECT id, session_id, role, content, created_at FROM chat_messages ' +
    'WHERE session_id = $1 ORDER BY created_at ASC, id ASC',
    [sessionId]
  );
  return res.rows;
}
/* Insert a message (user or assistant). */
async function insertChatMessage(id, sessionId, role, content, now) {
  await getPool().query(
    'INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, sessionId, role, content, now]
  );
}
/* Replace an assistant message's content in place (regenerate keeps the id +
   position; created_at is left untouched). */
async function updateChatMessageContent(id, content) {
  await getPool().query('UPDATE chat_messages SET content = $2 WHERE id = $1', [id, content]);
}
/* Bump a session's updated_at (server time) so it rises in the sidebar. */
async function touchChatSession(id, now) {
  await getPool().query('UPDATE chat_sessions SET updated_at = $2 WHERE id = $1', [id, now]);
}
/* Set the session title (from the first user message). */
async function setChatSessionTitle(id, title, now) {
  await getPool().query('UPDATE chat_sessions SET title = $2, updated_at = $3 WHERE id = $1', [id, title, now]);
}
/* Delete a session (cascades to its messages). */
async function deleteChatSession(id) {
  await getPool().query('DELETE FROM chat_sessions WHERE id = $1', [id]);
}
/* Delete a single message. */
async function deleteChatMessage(id) {
  await getPool().query('DELETE FROM chat_messages WHERE id = $1', [id]);
}

module.exports = {
  send: send,
  preflight: preflight,
  corsOrigin: corsOrigin,
  corsHeaders: corsHeaders,
  getPool: getPool,
  verifyPassword: verifyPassword,
  signToken: signToken,
  verifyToken: verifyToken,
  bearerToken: bearerToken,
  recordFailure: recordFailure,
  clearRateLimit: clearRateLimit,
  getAll: getAll,
  upsertAll: upsertAll,
  getChatSession: getChatSession,
  createChatSession: createChatSession,
  listChatSessions: listChatSessions,
  getChatMessages: getChatMessages,
  insertChatMessage: insertChatMessage,
  updateChatMessageContent: updateChatMessageContent,
  touchChatSession: touchChatSession,
  setChatSessionTitle: setChatSessionTitle,
  deleteChatSession: deleteChatSession,
  deleteChatMessage: deleteChatMessage
};
