/* POST /api/chat — send a message to the AI and stream the reply back as
   NDJSON lines (one JSON object per line):
     {"type":"meta","sessionId","title","userMessageId","assistantMessageId"}
     {"type":"delta","text":"..."}          (one or more)
     {"type":"done","ok":true}              (normal end)
     {"type":"error","error":"..."}         (provider/db failure mid-stream)
   Body: { sessionId? (existing thread), message }
   A new session is created lazily on the first message; the title is derived
   from the first user message. Both the user message and the assistant reply
   are persisted in the DB (single-user, auth token required).
   Streaming uses the Vercel Node `res.write`/`res.end` ServerResponse API and
   is also exercised by scripts/dev-server.js. */
'use strict';

var lib = require('./_lib');
var chat = require('./_chat');

var MAX_MESSAGE_LEN = 20000;

module.exports = async function handler(req, res) {
  if (lib.preflight(req, res)) return;
  if (!chat.requireAuth(req, res, lib)) return;
  if (req.method !== 'POST') { lib.send(res, 405, { error: 'method_not_allowed' }, req); return; }

  var body = req.body || {};
  var message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) { lib.send(res, 400, { error: 'missing_message' }, req); return; }
  if (message.length > MAX_MESSAGE_LEN) { lib.send(res, 400, { error: 'message_too_long' }, req); return; }
  if (!chat.aiConfigured()) { lib.send(res, 500, { error: 'ai_not_configured' }, req); return; }

  var origin = lib.corsOrigin(req);
  if (!origin) { lib.send(res, 403, { error: 'origin_not_allowed' }, req); return; }
  var headers = Object.assign({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store'
  }, lib.corsHeaders(origin));
  res.writeHead(200, headers);

  /* ---------- resolve the session (create lazily) ---------- */
  var now = Date.now();
  var sessionId = (typeof body.sessionId === 'string') ? body.sessionId : '';
  var session = null;
  var isNew = false;
  if (chat.validId(sessionId)) {
    try {
      session = await lib.getChatSession(sessionId);
    } catch (e) {
      /* a transient DB read failure must NOT split an existing thread by
         pretending the session is gone and creating a new one */
      console.error('chat session lookup failed:', e);
      res.write(chat.jsonLine({ type: 'error', error: 'db_error' }));
      res.end();
      return;
    }
  }
  if (!session) {
    /* no valid/known session -> start a new thread (a stale reference to a
       deleted session is silently rewritten to a fresh id) */
    sessionId = chat.uuid();
    isNew = true;
  }
  var title = isNew ? chat.deriveTitle(message) : (session ? session.title : '');

  var userMsgId = chat.uuid();
  var assistantMsgId = chat.uuid();

  /* ---------- persist the new user message (and session once) ---------- */
  try {
    if (isNew) { await lib.createChatSession(sessionId, title, now); }
    await lib.insertChatMessage(userMsgId, sessionId, 'user', message, now);
    if (isNew) { /* created_at == updated_at == now already */ }
    else { await lib.touchChatSession(sessionId, now); }
  } catch (e) {
    res.write(chat.jsonLine({ type: 'error', error: 'db_error' }));
    res.end();
    return;
  }

  /* ---------- build the conversation for the provider ---------- */
  var history = [];
  if (!isNew) {
    try { history = await lib.getChatMessages(sessionId); } catch (e) {
      /* a two-minute window: the DELETE that removed this session but not the
         message can't happen (cascade), so treat a read error as fatal */
      res.write(chat.jsonLine({ type: 'error', error: 'db_error' }));
      res.end();
      return;
    }
  }
  /* history already includes the user message we just inserted — but on a
     fresh session isNew skips the read, so add it explicitly. Either way the
     provider sees the full thread ending in this user message. */
  var providerMessages;
  if (isNew) {
    providerMessages = [{ role: 'user', content: message }];
  } else {
    providerMessages = history.map(function (m) {
      return { role: m.role, content: m.content };
    });
  }

  /* ---------- announce meta before the first token ---------- */
  res.write(chat.jsonLine({ type: 'meta', sessionId: sessionId, title: title,
                            userMessageId: userMsgId, assistantMessageId: assistantMsgId }));

  /* ---------- stream the AI reply ---------- */
  var full = '';
  var failed = false;
  var failMsg = 'ai_error';
  try {
    var prov = await fetch(chat.providerUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + process.env.AI_API_KEY },
      body: JSON.stringify({ model: process.env.AI_MODEL, messages: providerMessages, stream: true })
    });
    if (!prov.ok) {
      failed = true;
      failMsg = (prov.status === 401 || prov.status === 403) ? 'ai_unauthorized' : 'ai_error';
    } else {
      var reader = prov.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      /* read the provider SSE stream, forward content deltas, accumulate */
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
      /* a provider that closes right after the final line without a trailing
         newline leaves it in `buf` — flush it so the last delta isn't lost */
      if (!failed && buf.trim()) {
        var tp = chat.parseProviderLine(buf);
        if (tp) {
          if (tp.type === 'delta') { full += tp.text; res.write(chat.jsonLine({ type: 'delta', text: tp.text })); }
          else if (tp.type === 'error') { failed = true; failMsg = 'ai_error'; }
        }
      }
    }
  } catch (e) {
    console.error('chat provider stream failed:', e);
    failed = true;
  }

  /* ---------- persist the assistant reply + send one terminal line -------- */
  if (failed) {
    res.write(chat.jsonLine({ type: 'error', error: failMsg }));
  } else if (full.length > 0) {
    var mNow = Date.now();
    if (mNow <= now) { mNow = now + 1; }
    try {
      await lib.insertChatMessage(assistantMsgId, sessionId, 'assistant', full, mNow);
      await lib.touchChatSession(sessionId, Date.now());
      res.write(chat.jsonLine({ type: 'done', ok: true }));
    } catch (e) {
      res.write(chat.jsonLine({ type: 'error', error: 'db_error' }));
    }
  } else {
    /* provider returned no content (empty completion) — surface it, don't hang */
    res.write(chat.jsonLine({ type: 'error', error: 'ai_empty' }));
  }
  res.end();
};

module.exports.config = { maxDuration: 60 };
