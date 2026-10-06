/* /api/data — read/write the sync KV store.
   GET  -> { items: { key: { v, ts } } }
   POST -> { items: { key: { v, ts } } }  (v null/undefined deletes the key)
        <- { ok: true, adjusted?: { key: { from, to } } }  (adjusted only lists
           keys whose future timestamp was clamped to server time — clampTs)
   Both require `Authorization: Bearer <token>` from /api/auth. */
'use strict';

var lib = require('./_lib');

function badRequest(res, msg, req) {
  lib.send(res, 400, { error: msg }, req);
}

module.exports = async function handler(req, res) {
  if (lib.preflight(req, res)) return;

  if (!lib.bearerToken(req) || !lib.verifyToken(lib.bearerToken(req))) {
    lib.send(res, 401, { error: 'unauthorized' }, req);
    return;
  }

  if (req.method === 'GET') {
    try {
      var items = await lib.getAll();
      lib.send(res, 200, { items: items }, req);
    } catch (e) {
      console.error('db get failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  if (req.method === 'POST') {
    var body = req.body || {};
    /* Validation and the clock-skew clamp live in _lib.sanitizeItems, which is
       pure — so the api tests cover this path without a database. */
    var clean = lib.sanitizeItems(body.items, Date.now());
    if (clean.error) { badRequest(res, clean.error, req); return; }
    try {
      await lib.upsertAll(clean.items);
      var payload = { ok: true };
      /* Report keys whose timestamp had to be pulled back to server time: the
         client surfaces this so a skewed clock is visible instead of silently
         losing the conflicts (see index.html clockIsSkewed). */
      if (Object.keys(clean.adjusted).length > 0) { payload.adjusted = clean.adjusted; }
      lib.send(res, 200, payload, req);
    } catch (e) {
      console.error('db write failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  lib.send(res, 405, { error: 'method_not_allowed' }, req);
};
