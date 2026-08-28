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

  if (req.method === 'PATCH') {
    /* Rename a thread: { id, title }. The title is user-typed, so cap it and
       allow empty? No — an empty title would blank the row; require 1..100. */
    var body = req.body || {};
    var rid = typeof body.id === 'string' ? body.id : '';
    var rtitle = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
    if (!chat.validId(rid)) { lib.send(res, 400, { error: 'bad_id' }, req); return; }
    if (!rtitle || rtitle.length > 100) { lib.send(res, 400, { error: 'bad_title' }, req); return; }
    try {
      await lib.setChatSessionTitle(rid, rtitle, Date.now());
      lib.send(res, 200, { ok: true, title: rtitle }, req);
    } catch (e) {
      console.error('rename chat session failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  if (req.method === 'POST') {
    /* Regenerate a thread title with the AI: { action: 'regenerate-title', id }.
       Reads the thread's messages, asks the model for a short name, updates it. */
    var pbody = req.body || {};
    if (pbody.action !== 'regenerate-title') { lib.send(res, 400, { error: 'bad_action' }, req); return; }
    var sid = typeof pbody.id === 'string' ? pbody.id : '';
    if (!chat.validId(sid)) { lib.send(res, 400, { error: 'bad_id' }, req); return; }
    if (!chat.aiConfigured()) { lib.send(res, 500, { error: 'ai_not_configured' }, req); return; }
    var msgs;
    try { msgs = await lib.getChatMessages(sid); } catch (e) {
      console.error('regenerate-title read failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
      return;
    }
    var newTitle;
    try { newTitle = await chat.generateTitle(msgs); } catch (e) {
      console.error('regenerate-title AI failed:', e);
      lib.send(res, 502, { error: 'ai_error' }, req);
      return;
    }
    if (!newTitle) { lib.send(res, 200, { ok: false, error: 'empty_title' }, req); return; }
    try {
      await lib.setChatSessionTitle(sid, newTitle, Date.now());
      lib.send(res, 200, { ok: true, title: newTitle }, req);
    } catch (e) {
      console.error('regenerate-title write failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  lib.send(res, 405, { error: 'method_not_allowed' }, req);
};

module.exports.config = { maxDuration: 60 };
