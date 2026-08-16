/* Syntax gate for the inline <script> blocks in index.html.
   The page is a single self-contained HTML file (no build step, no bundler),
   so a typo in any inline script would ship straight to production and kill
   the whole page. Extract each block and run `node --check` on it (parse
   only — the DOM globals are never executed). Exit non-zero on the first
   invalid block. Usage: npm run check */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var htmlPath = path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(htmlPath, 'utf8');

/* Inline blocks only: `<script>` WITHOUT a src attribute. */
var SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

var m;
var count = 0;
var failed = false;
while ((m = SCRIPT_RE.exec(html)) !== null) {
  var code = m[1];
  if (!code.trim()) continue;
  count += 1;
  var tmp = path.join(os.tmpdir(), 'start-inline-js-' + process.pid + '-' + count + '.js');
  fs.writeFileSync(tmp, code);
  var r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (r.status !== 0) {
    failed = true;
    console.error('FAIL inline script #' + count + ':');
    console.error(r.stderr || r.stdout);
  }
}

if (count === 0) {
  console.error('FAIL: no inline <script> blocks found in index.html');
  process.exit(1);
}
if (failed) {
  console.error('index.html contains invalid inline JS');
  process.exit(1);
}
console.log('OK: ' + count + ' inline script block(s) parse cleanly');
