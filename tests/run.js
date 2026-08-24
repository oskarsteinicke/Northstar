#!/usr/bin/env node
// Run every suite: node tests/run.js  (or a single one: node tests/run.js auth)
const fs = require('fs');
const path = require('path');

const only = process.argv[2];
const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => !only || f.startsWith(only))
  .sort();

if (!files.length) { console.error('No matching suites.'); process.exit(1); }

(async () => {
  let failed = 0;
  for (const f of files) {
    console.log(`\n=== ${f.replace('.test.js', '')} ===`);
    try {
      // Suites may be sync or async; await covers both.
      failed += (await require(path.join(__dirname, f))()) || 0;
    } catch (e) {
      console.log('  SUITE CRASHED:', e.message);
      failed++;
    }
  }
  console.log(failed === 0 ? '\nAll suites passed.\n' : `\n${failed} check(s) failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
