/**
 * patch-mezo.cjs
 * Fixes a packaging bug in @mezo-org/orangekit where the compiled
 * dist/src/wallet/index.js imports a raw .ts source file instead of
 * the compiled .js file. Runs automatically after npm install.
 */

const fs   = require('fs');
const path = require('path');

const TARGET = path.join(
  __dirname, '..', 'node_modules',
  '@mezo-org', 'orangekit', 'dist', 'src', 'wallet', 'index.js'
);

if (!fs.existsSync(TARGET)) {
  console.log('[patch-mezo] File not found, skipping:', TARGET);
  process.exit(0);
}

const original = fs.readFileSync(TARGET, 'utf8');
const BROKEN   = '@mezo-org/orangekit-smart-account/src/lib/utils/chains';
const FIXED    = '@mezo-org/orangekit-smart-account/dist/src/lib/utils/chains.js';

if (original.includes(FIXED)) {
  console.log('[patch-mezo] Already patched, skipping.');
  process.exit(0);
}

if (!original.includes(BROKEN)) {
  console.log('[patch-mezo] Broken import not found — package may have been updated. Skipping.');
  process.exit(0);
}

const patched = original.replace(BROKEN, FIXED);
fs.writeFileSync(TARGET, patched, 'utf8');
console.log('[patch-mezo] ✓ Patched orangekit wallet/index.js');
console.log('[patch-mezo]   ' + BROKEN);
console.log('[patch-mezo] → ' + FIXED);
