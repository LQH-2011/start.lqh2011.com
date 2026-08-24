/* Unit tests for the sync API handlers (api/auth.js, api/data.js,
   api/_lib.js) with NO database — the DB-dependent paths are exercised only
   as far as the auth gate + error handling, which is where the real logic
   lives (the pool is never reached with a valid-but-unreachable DATABASE_URL,
   so those handlers return 500 db_error deterministically).

   Run with: npm run test:api   (node --test tests/api/)

   NOTE: node --test runs each test FILE in its own process, so the env
   mutations here are scoped to this file. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

/* ---------- env (must be set before requiring the handlers) ---------- */
process.env.AUTH_PASSWORD_HASH = makeHash('correct-password');
process.env.AUTH_TOKEN_SECRET = 'test-token-secret';
process.env.ALLOWED_ORIGIN = 'https://start.lqh2011.com, https://preview.lqh2011.com';
/* unreachable port: pool connections fail fast with ECONNREFUSED */
process.env.DATABASE_URL = 'postgres://ci:ci@127.0.0.1:1/cidb';

const lib = require('../../api/_lib.js');
const authHandler = require('../../api/auth.js');
const dataHandler = require('../../api/data.js');

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
const DISALLOWED = 'https://evil.example';
const UNIQUE_IP = () => '203.0.113.' + (100 + Math.floor(Math.random() * 100));

function forgeToken(secret, payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  return p + '.' + sig;
}

/* keep the expected DB-error noise out of the output */
const origConsoleError = console.error;
test.beforeEach(() => { console.error = () => {}; });
test.afterEach(() => { console.error = origConsoleError; });

/* ================= _lib ================= */

test('verifyPassword: correct, wrong, and malformed env hash', () => {
  assert.equal(lib.verifyPassword('correct-password'), true);
  assert.equal(lib.verifyPassword('wrong'), false);
  assert.equal(lib.verifyPassword(''), false);

  const prev = process.env.AUTH_PASSWORD_HASH;
  process.env.AUTH_PASSWORD_HASH = 'not-scrypt-format';
  assert.equal(lib.verifyPassword('correct-password'), false);
  process.env.AUTH_PASSWORD_HASH = prev;
});

test('signToken/verifyToken: roundtrip, forged, expired, missing secret', () => {
  const tok = lib.signToken();
  const payload = lib.verifyToken(tok);
  assert.equal(payload.sub, 'owner');
  assert.equal(typeof payload.exp, 'number');
  assert.ok(payload.exp > Date.now());

  assert.equal(lib.verifyToken('garbage'), null);
  assert.equal(lib.verifyToken('a.b.c'), null);
  assert.equal(lib.verifyToken(null), null);
  /* valid structure, wrong signature */
  assert.equal(lib.verifyToken(forgeToken('other-secret', { sub: 'owner', exp: Date.now() + 1000 })), null);
  /* valid signature, expired */
  assert.equal(lib.verifyToken(forgeToken(process.env.AUTH_TOKEN_SECRET, { sub: 'owner', exp: Date.now() - 1000 })), null);
  /* valid signature, wrong subject */
  assert.equal(lib.verifyToken(forgeToken(process.env.AUTH_TOKEN_SECRET, { sub: 'attacker', exp: Date.now() + 1000 })), null);

  const prev = process.env.AUTH_TOKEN_SECRET;
  delete process.env.AUTH_TOKEN_SECRET;
  assert.equal(lib.verifyToken(tok), null);
  assert.throws(() => lib.signToken(), /AUTH_TOKEN_SECRET/);
  process.env.AUTH_TOKEN_SECRET = prev;
});

test('bearerToken parses the Authorization header', () => {
  assert.equal(lib.bearerToken({ headers: { authorization: 'Bearer abc.def' } }), 'abc.def');
  assert.equal(lib.bearerToken({ headers: { authorization: 'bearer abc' } }), 'abc');
  assert.equal(lib.bearerToken({ headers: {} }), null);
  assert.equal(lib.bearerToken({ headers: { authorization: 'Basic abc' } }), null);
});

test('CORS: allowed origin echoed, disallowed/absent origin gets no ACAO', () => {
  /* exercised through lib.send — the public path that calls applyCors */
  const res = makeRes();
  lib.send(res, 200, { ok: true }, makeReq({ headers: { origin: ORIGIN } }));
  assert.equal(res.headers['Access-Control-Allow-Origin'], ORIGIN);
  assert.equal(res.headers['Access-Control-Allow-Methods'], 'GET, POST, DELETE, OPTIONS');
  assert.equal(res.headers['Vary'], 'Origin');
  assert.equal(res.body.ok, true);

  const res2 = makeRes();
  lib.send(res2, 200, { ok: true }, makeReq({ headers: { origin: DISALLOWED } }));
  assert.equal(res2.headers['Access-Control-Allow-Origin'], undefined);

  const res3 = makeRes();
  lib.send(res3, 200, { ok: true }, makeReq({ headers: {} }));
  assert.equal(res3.headers['Access-Control-Allow-Origin'], undefined);

  /* multi-origin list (preview) */
  const res4 = makeRes();
  lib.send(res4, 200, { ok: true }, makeReq({ headers: { origin: 'https://preview.lqh2011.com' } }));
  assert.equal(res4.headers['Access-Control-Allow-Origin'], 'https://preview.lqh2011.com');
});

/* ================= auth handler ================= */

test('auth: OPTIONS preflight (allowed + disallowed origin)', async () => {
  const res = makeRes();
  await authHandler(makeReq({ method: 'OPTIONS', headers: { origin: ORIGIN } }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], ORIGIN);

  const res2 = makeRes();
  await authHandler(makeReq({ method: 'OPTIONS', headers: { origin: DISALLOWED } }), res2);
  assert.equal(res2.statusCode, 204);
  assert.equal(res2.headers['Access-Control-Allow-Origin'], undefined);
});

test('auth: correct password -> 200 token; wrong -> 401; missing -> 400; wrong method -> 405', async () => {
  const res = makeRes();
  await authHandler(makeReq({
    method: 'POST',
    headers: { origin: ORIGIN },
    body: { password: 'correct-password' }
  }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.token === 'string' && res.body.token.includes('.'));
  assert.equal(res.headers['Access-Control-Allow-Origin'], ORIGIN);

  const res2 = makeRes();
  await authHandler(makeReq({ method: 'POST', body: { password: 'wrong' } }), res2);
  assert.equal(res2.statusCode, 401);
  assert.equal(res2.body.error, 'invalid_password');

  const res3 = makeRes();
  await authHandler(makeReq({ method: 'POST', body: {} }), res3);
  assert.equal(res3.statusCode, 400);
  assert.equal(res3.body.error, 'missing_password');

  const res4 = makeRes();
  await authHandler(makeReq({ method: 'GET' }), res4);
  assert.equal(res4.statusCode, 405);
});

test('auth: rate limit kicks in after 10 wrong attempts and clears on success', async () => {
  const ip = UNIQUE_IP();
  for (let i = 0; i < 10; i++) {
    const res = makeRes();
    await authHandler(makeReq({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { password: 'wrong' } }), res);
    assert.equal(res.statusCode, 401, 'attempt ' + (i + 1));
  }
  const res429 = makeRes();
  await authHandler(makeReq({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { password: 'wrong' } }), res429);
  assert.equal(res429.statusCode, 429);

  /* the owner's correct password still works and clears the counter */
  const resOk = makeRes();
  await authHandler(makeReq({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { password: 'correct-password' } }), resOk);
  assert.equal(resOk.statusCode, 200);

  const resAfter = makeRes();
  await authHandler(makeReq({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { password: 'wrong' } }), resAfter);
  assert.equal(resAfter.statusCode, 401, 'counter was cleared');
});

/* ================= data handler ================= */

test('data: requires a valid bearer token', async () => {
  const noAuth = makeRes();
  await dataHandler(makeReq({ method: 'GET' }), noAuth);
  assert.equal(noAuth.statusCode, 401);

  const badAuth = makeRes();
  await dataHandler(makeReq({ method: 'GET', headers: { authorization: 'Bearer garbage' } }), badAuth);
  assert.equal(badAuth.statusCode, 401);

  const badSig = makeRes();
  await dataHandler(makeReq({ method: 'GET', headers: { authorization: 'Bearer ' + forgeToken('wrong-secret', { sub: 'owner', exp: Date.now() + 1000 }) } }), badSig);
  assert.equal(badSig.statusCode, 401);
});

test('data: OPTIONS preflight passes without auth', async () => {
  const res = makeRes();
  await dataHandler(makeReq({ method: 'OPTIONS', headers: { origin: ORIGIN } }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], ORIGIN);
});

test('data: POST body validation (bad items, too many keys) fails before the DB', async () => {
  const auth = { authorization: 'Bearer ' + lib.signToken() };

  const bad = makeRes();
  await dataHandler(makeReq({ method: 'POST', headers: auth, body: {} }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, 'bad_items');

  const badArr = makeRes();
  await dataHandler(makeReq({ method: 'POST', headers: auth, body: { items: [] } }), badArr);
  assert.equal(badArr.statusCode, 400);

  const tooMany = {};
  for (let i = 0; i < 65; i++) { tooMany['k' + i] = { v: 'x', ts: 1 }; }
  const res65 = makeRes();
  await dataHandler(makeReq({ method: 'POST', headers: auth, body: { items: tooMany } }), res65);
  assert.equal(res65.statusCode, 400);
  assert.equal(res65.body.error, 'too_many_keys');
});

test('data: valid token + unreachable DB -> 500 db_error (gate passed)', async () => {
  const auth = { authorization: 'Bearer ' + lib.signToken() };

  const res = makeRes();
  await dataHandler(makeReq({ method: 'GET', headers: auth }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'db_error');

  const res2 = makeRes();
  await dataHandler(makeReq({
    method: 'POST',
    headers: auth,
    body: { items: { 'start.theme': { v: 'dark', ts: Date.now() } } }
  }), res2);
  assert.equal(res2.statusCode, 500);
  assert.equal(res2.body.error, 'db_error');
});
