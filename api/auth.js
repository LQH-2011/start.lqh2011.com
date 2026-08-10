/* POST /api/auth — {password} -> {token}. Single-user: one password,
   a signed 90-day token returned. Rate-limited per IP. */
'use strict';

var lib = require('./_lib');

module.exports = async function handler(req, res) {
  if (lib.preflight(req, res)) return;

  if (req.method !== 'POST') {
    lib.send(res, 405, { error: 'method_not_allowed' }, lib.allowedOrigin());
    return;
  }

  var body = req.body || {};
  var password = typeof body.password === 'string' ? body.password : '';
  if (!password) {
    lib.send(res, 400, { error: 'missing_password' }, lib.allowedOrigin());
    return;
  }

  if (lib.verifyPassword(password)) {
    lib.clearRateLimit(req);
    lib.send(res, 200, { token: lib.signToken() }, lib.allowedOrigin());
    return;
  }

  /* wrong password: count it; over the limit -> 429 (indistinguishable from
     401 to a scanner, but the owner's correct password is never blocked) */
  if (lib.recordFailure(req)) {
    lib.send(res, 429, { error: 'too_many_attempts' }, lib.allowedOrigin());
    return;
  }
  lib.send(res, 401, { error: 'invalid_password' }, lib.allowedOrigin());
};
