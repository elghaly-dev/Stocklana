#!/usr/bin/env node
import { runPegWatch, formatTable } from './docs/js/peg-watch.js';
import { fetchBackedSnapshot } from './docs/js/backed.js';
import { STOCKS } from './docs/js/config.js';

// Node has no CORS limits, so the CLI reads the xStocks public API directly.
let issuer = null;
let issuerError = null;
try {
  issuer = await fetchBackedSnapshot(STOCKS);
} catch (e) {
  issuerError = String(e?.message || e);
}
const result = await runPegWatch({ issuer, issuerError });
console.log(formatTable(result));

const failed = result.rows.filter((r) => r.errors.length);
if (failed.length) {
  console.error('\nErrors:');
  for (const r of failed) {
    console.error(`  ${r.symbol}: ${r.errors.join('; ')}`);
  }
  process.exit(1);
}
