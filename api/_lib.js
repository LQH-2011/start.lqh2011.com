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
function allowedOrigin() {
  return process.env.ALLOWED_ORIGIN || 'https://start.lqh2011.com';
}
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}
function send(res, status, obj, origin) {
  var headers = corsHeaders(origin);
  Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
  res.status(status).json(obj);
}
/* OPTIONS preflight for cross-origin fetches (page on GH Pages, API on Vercel). */
function preflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  send(res, 204, {}, allowedOrigin());
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

module.exports = {
  allowedOrigin: allowedOrigin,
  send: send,
  preflight: preflight,
  verifyPassword: verifyPassword,
  signToken: signToken,
  verifyToken: verifyToken,
  bearerToken: bearerToken,
  recordFailure: recordFailure,
  clearRateLimit: clearRateLimit,
  getAll: getAll,
  upsertAll: upsertAll
};
