/* Dependency-free static server for the UI smoke tests.
   Serves ONLY index.html (the page has no other local assets) so the tests
   never leak other repo files. The sync module sets API_BASE='' when served
   from 127.0.0.1, so its /api/data fetch hits this server, gets a 404, and
   falls back to the local-first path — no real API involved, no CORS, no
   auth overlay. Usage: node scripts/static-server.js [port] (default 8123) */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = Number(process.argv[2] || 8123);
var HTML = path.join(__dirname, '..', 'index.html');

var server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(HTML).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('static test server on http://127.0.0.1:' + PORT);
});
