/* Generate AUTH_PASSWORD_HASH for the Vercel env var.
   Usage:
     node scripts/hash-password.js            # generate a random password + hash
     node scripts/hash-password.js 'mypass'   # hash a password you chose
   Output format: scrypt$<salt_hex>$<hash_hex> (see api/_lib.js). */
'use strict';

var crypto = require('crypto');

var password = process.argv[2];
if (!password) {
  password = crypto.randomBytes(15).toString('base64url');
  console.log('Generated password (save it somewhere safe):');
  console.log('  ' + password);
  console.log('');
}

var salt = crypto.randomBytes(16);
var hash = crypto.scryptSync(password, salt, 64);

console.log('AUTH_PASSWORD_HASH=' + 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex'));
console.log('');
console.log('Add AUTH_PASSWORD_HASH to the Vercel project env vars (or local .env for `npm run dev`).');
