/* /api/data — read/write the sync KV store.
   GET  -> { items: { key: { v, ts } } }
   POST -> { items: { key: { v, ts } } }  (v null/undefined deletes the key)
   Both require `Authorization: Bearer <token>` from /api/auth. */
'use strict';

var lib = require('./_lib');

var MAX_KEYS = 64;
var MAX_KEY_LEN = 128;

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
    var raw = body.items;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      badRequest(res, 'bad_items', req);
      return;
    }
    var clean = {};
    Object.keys(raw).forEach(function (k) {
      if (k.length === 0 || k.length > MAX_KEY_LEN) return;
      var it = raw[k];
      if (!it || typeof it !== 'object' || Array.isArray(it)) return;
      var ts = Number(it.ts);
      if (!Number.isFinite(ts)) return;
      clean[k] = { v: it.v === undefined ? null : it.v, ts: Math.floor(ts) };
    });
    var keys = Object.keys(clean);
    if (keys.length === 0) { badRequest(res, 'bad_items', req); return; }
    if (keys.length > MAX_KEYS) { badRequest(res, 'too_many_keys', req); return; }
    try {
      await lib.upsertAll(clean);
      lib.send(res, 200, { ok: true }, req);
    } catch (e) {
      console.error('db write failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  lib.send(res, 405, { error: 'method_not_allowed' }, req);
};
