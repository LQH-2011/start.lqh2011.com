/* /api/chat-messages — load, delete, and regenerate individual messages.
   GET    ?session=<sessionId>         -> { messages: [{ id, role, content, created_at }] }
   DELETE ?id=<messageId>              -> { ok: true }
   POST   { sessionId, assistantMessageId }  -> stream a replacement for the
                                               assistant message (NDJSON, like
                                               /api/chat); the message is
                                               regenerated from the thread up to
                                               its triggering user message.
   All require Authorization: Bearer <token>. */
'use strict';

var lib = require('./_lib');
var chat = require('./_chat');

function queryParam(req, name) {
  try {
    var u = new URL(req.url, 'http://localhost');
    return u.searchParams.get(name);
  } catch (e) { return null; }
}

/* Shared streaming tail: stream a provider reply, replacing the assistant
   message at `targetId`. Delivers the same NDJSON contract as /api/chat. */
async function streamRegenerate(req, res, lib, chat, sessionId, targetId) {
  var now = Date.now();
  var session = null;
  try { session = await lib.getChatSession(sessionId); } catch (e) {}
  if (!session) { lib.send(res, 404, { error: 'session_not_found' }, req); return; }

  var messages;
  try { messages = await lib.getChatMessages(sessionId); } catch (e) {
    lib.send(res, 500, { error: 'db_error' }, req); return;
  }
  var targetIdx = -1;
  for (var i = 0; i < messages.length; i++) { if (messages[i].id === targetId) { targetIdx = i; break; } }
  if (targetIdx === -1) { lib.send(res, 404, { error: 'message_not_found' }, req); return; }
  /* regeneration replaces an ASSISTANT reply in place — never overwrite a user
     message (the provider would write text over it while its role stays user) */
  if (messages[targetIdx].role !== 'assistant') {
    lib.send(res, 400, { error: 'not_assistant_message' }, req);
    return;
  }

  /* find the nearest preceding user message; regenerate needs its context */
  var userIdx = -1;
  for (var j = targetIdx - 1; j >= 0; j--) { if (messages[j].role === 'user') { userIdx = j; break; } }
  if (userIdx === -1) { lib.send(res, 400, { error: 'no_user_message' }, req); return; }
  var context = messages.slice(0, userIdx + 1).map(function (m) {
    return { role: m.role, content: m.content };
  });

  var origin = lib.corsOrigin(req);
  if (!origin) { lib.send(res, 403, { error: 'origin_not_allowed' }, req); return; }
  var headers = Object.assign({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store'
  }, lib.corsHeaders(origin));
  res.writeHead(200, headers);
  res.write(chat.jsonLine({ type: 'meta', sessionId: sessionId, title: session.title,
                            assistantMessageId: targetId }));

  var full = '';
  var failed = false;
  var failMsg = 'ai_error';
  try {
    var prov = await fetch(chat.providerUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + process.env.AI_API_KEY },
      body: JSON.stringify({ model: process.env.AI_MODEL, messages: context, stream: true })
    });
    if (!prov.ok) {
      failed = true;
      failMsg = (prov.status === 401 || prov.status === 403) ? 'ai_unauthorized' : 'ai_error';
    } else {
      var reader = prov.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      for (;;) {
        if (failed) break;
        var r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          var line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          var p = chat.parseProviderLine(line);
          if (!p) continue;
          if (p.type === 'delta') { full += p.text; res.write(chat.jsonLine({ type: 'delta', text: p.text })); }
          else if (p.type === 'error') { failed = true; failMsg = 'ai_error'; break; }
        }
      }
      /* flush a trailing SSE line that ended without a newline */
      if (!failed && buf.trim()) {
        var tp = chat.parseProviderLine(buf);
        if (tp) {
          if (tp.type === 'delta') { full += tp.text; res.write(chat.jsonLine({ type: 'delta', text: tp.text })); }
          else if (tp.type === 'error') { failed = true; failMsg = 'ai_error'; }
        }
      }
    }
  } catch (e) {
    console.error('chat regenerate stream failed:', e);
    failed = true;
  }

  if (failed) {
    res.write(chat.jsonLine({ type: 'error', error: failMsg }));
  } else if (full.length > 0) {
    try {
      await lib.updateChatMessageContent(targetId, full);
      await lib.touchChatSession(sessionId, Date.now());
      res.write(chat.jsonLine({ type: 'done', ok: true }));
    } catch (e) {
      res.write(chat.jsonLine({ type: 'error', error: 'db_error' }));
    }
  } else {
    res.write(chat.jsonLine({ type: 'error', error: 'ai_empty' }));
  }
  res.end();
}

module.exports = async function handler(req, res) {
  if (lib.preflight(req, res)) return;
  if (!chat.requireAuth(req, res, lib)) return;

  if (req.method === 'GET') {
    var sessionId = queryParam(req, 'session');
    if (!chat.validId(sessionId)) { lib.send(res, 400, { error: 'bad_session' }, req); return; }
    try {
      var messages = await lib.getChatMessages(sessionId);
      lib.send(res, 200, { messages: messages }, req);
    } catch (e) {
      console.error('get chat messages failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  if (req.method === 'DELETE') {
    var id = queryParam(req, 'id');
    if (!chat.validId(id)) { lib.send(res, 400, { error: 'bad_id' }, req); return; }
    try {
      await lib.deleteChatMessage(id);
      lib.send(res, 200, { ok: true }, req);
    } catch (e) {
      console.error('delete chat message failed:', e);
      lib.send(res, 500, { error: 'db_error' }, req);
    }
    return;
  }

  if (req.method === 'POST') {
    if (!chat.aiConfigured()) { lib.send(res, 500, { error: 'ai_not_configured' }, req); return; }
    var body = req.body || {};
    var sid = typeof body.sessionId === 'string' ? body.sessionId : '';
    var target = typeof body.assistantMessageId === 'string' ? body.assistantMessageId : '';
    if (!chat.validId(sid) || !chat.validId(target)) { lib.send(res, 400, { error: 'bad_body' }, req); return; }
    await streamRegenerate(req, res, lib, chat, sid, target);
    return;
  }

  lib.send(res, 405, { error: 'method_not_allowed' }, req);
};

module.exports.config = { maxDuration: 60 };
