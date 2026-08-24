/* /api/chat-sessions — the sidebar's session list.
   GET                 -> { sessions: [{ id, title, created_at, updated_at, last_message }] }
   DELETE ?id=<id>     -> { ok: true }   (cascades to the session's messages)
   Both require Authorization: Bearer <token>. */
'use strict';

var lib = require('./_lib');
var chat = require('./_chat');

function queryParam(req, name) {
  try {
    var u = new URL(req.url, 'http://localhost');
    return u.searchParams.get(name);
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  if (lib.preflight(req, res)) return;
  if (!chat.requireAuth(req, res, lib)) return;

  if (req.method === 'GET') {
    try {
      var sessions = await lib.listChatSessions();
      lib.send(res, 200, { sessions: sessions }, req);
    } catch (e) {
      console.error('list chat sessions failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  if (req.method === 'DELETE') {
    var id = queryParam(req, 'id');
    if (!chat.validId(id)) { lib.send(res, 400, { error: 'bad_id' }, req); return; }
    try {
      await lib.deleteChatSession(id);
      lib.send(res, 200, { ok: true }, req);
    } catch (e) {
      console.error('delete chat session failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  lib.send(res, 405, { error: 'method_not_allowed' }, req);
};

module.exports.config = { maxDuration: 60 };
