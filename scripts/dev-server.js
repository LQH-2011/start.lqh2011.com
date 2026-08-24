/* Local dev server for the Vercel functions — same handlers, real Postgres.
   Usage:
     cp .env.example .env   # fill DATABASE_URL, AUTH_PASSWORD_HASH, AUTH_TOKEN_SECRET
     npm install
     npm run dev            # -> http://127.0.0.1:8787/api/auth, /api/data
   The handlers are exercised unmodified (Vercel provides req.body pre-parsed;
   this server parses JSON bodies before calling them). */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

/* tiny .env loader (no dotenv dep) */
(function loadEnv() {
  var file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
    var m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  });
})();

var authHandler = require('../api/auth.js');
var dataHandler = require('../api/data.js');
var chatHandler = require('../api/chat.js');
var chatSessionsHandler = require('../api/chat-sessions.js');
var chatMessagesHandler = require('../api/chat-messages.js');

function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
    });
    req.on('error', function () { resolve({}); });
  });
}

function makeRes(res) {
  var headers = {};
  return {
    setHeader: function (k, v) { headers[k] = v; },
    /* streaming support for the chat endpoints (Vercel Node ServerResponse) */
    writeHead: function (code, obj) { res.writeHead(code, obj || {}); },
    write: function (chunk) { res.write(chunk); },
    end: function () { res.end(); },
    status: function (code) {
      return {
        json: function (obj) {
          var body = JSON.stringify(obj);
          res.writeHead(code, Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body)
          }, headers));
          res.end(body);
        }
      };
    }
  };
}

var server = http.createServer(async function (req, res) {
  var url = new URL(req.url, 'http://127.0.0.1');
  /* serve the page too, so `npm run dev` is a full local replica
     (page + API on one origin — the same-origin path of the deployment) */
  if (url.pathname === '/' || url.pathname === '/index.html') {
    var file = path.join(__dirname, '..', 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  var fakeReq = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: {}
  };
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    fakeReq.body = await readBody(req);
  }
  var fakeRes = makeRes(res);
  try {
    if (url.pathname === '/api/auth') await authHandler(fakeReq, fakeRes);
    else if (url.pathname === '/api/data') await dataHandler(fakeReq, fakeRes);
    else if (url.pathname === '/api/chat') await chatHandler(fakeReq, fakeRes);
    else if (url.pathname === '/api/chat-sessions') await chatSessionsHandler(fakeReq, fakeRes);
    else if (url.pathname === '/api/chat-messages') await chatMessagesHandler(fakeReq, fakeRes);
    else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    }
  } catch (e) {
    console.error('handler error:', e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  }
});

var PORT = Number(process.env.PORT || 8787);
server.listen(PORT, '127.0.0.1', function () {
  console.log('sync API dev server on http://127.0.0.1:' + PORT);
  console.log('  POST /api/auth   {password} -> {token}');
  console.log('  GET  /api/data   (Bearer)   -> {items}');
  console.log('  POST /api/data   (Bearer)   {items}');
});
