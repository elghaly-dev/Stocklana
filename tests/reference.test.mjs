// The premium's reference is Pyth while it is fresh, and the xStocks issuer quote when Pyth is
// past the 96 h limit and the quote snapshot is at most 2 h old. Otherwise Pyth stays, flagged REF STALE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickReference, computeFlags, runPegWatch } from '../docs/js/peg-watch.js';
import { THRESHOLDS } from '../docs/js/config.js';

const NOW = 2_000_000_000; // seconds
const iso = (sec) => new Date(sec * 1000).toISOString();
const pyth = (ageSec, priceUsd = 227.17) => ({ ok: true, priceUsd, publishTime: NOW - ageSec });
const H = 3600;

test('fresh Pyth stays the reference even when a quote is there', () => {
  const r = pickReference(pyth(1 * H), 216.34, iso(NOW - 600), NOW);
  assert.deepEqual(r, { source: 'pyth', usd: 227.17, ageSec: H, pythUsd: 227.17, pythAgeSec: H });
});

test('stale Pyth + quote at most 2 h old -> the quote is the reference', () => {
  const r = pickReference(pyth(534 * H), 216.34, iso(NOW - 600), NOW);
  assert.deepEqual(r, { source: 'issuer', usd: 216.34, ageSec: 600, pythUsd: 227.17, pythAgeSec: 534 * H });
});

test('Pyth unreadable + fresh quote -> the quote is the reference', () => {
  const r = pickReference({ ok: false, error: 'rpc down' }, 216.34, iso(NOW - 60), NOW);
  assert.equal(r.source, 'issuer');
  assert.equal(r.pythUsd, null);
});

test('stale Pyth + no usable quote -> Pyth stays (and is flagged REF STALE)', () => {
  const stale = pyth(534 * H);
  for (const [quote, at] of [
    [216.34, iso(NOW - 3 * H)], // quote older than 2 h
    [216.34, null], // no fetch time: never treated as fresh
    [216.34, 'not a date'],
    [null, iso(NOW - 60)],
    [0, iso(NOW - 60)],
    [Number.NaN, iso(NOW - 60)],
  ]) {
    const r = pickReference(stale, quote, at, NOW);
    assert.equal(r.source, 'pyth', `quote=${quote} at=${at}`);
    assert.equal(r.usd, 227.17);
  }
  assert.equal(THRESHOLDS.issuerRefMaxAgeSeconds, 2 * H);
});

test('flags: issuer reference says so and drops REF STALE; stale Pyth keeps REF STALE', () => {
  const base = { halted: false, premiumBps: 10, errors: [] };
  const issuerFlags = computeFlags({ ...base, refSource: 'issuer', refAgeSec: 600, pythAgeSec: 534 * H }, true);
  assert.equal(issuerFlags, 'REF: xStocks quote (Pyth 534h old)');
  assert.ok(!issuerFlags.includes('STALE'));
  const pythFlags = computeFlags({ ...base, refSource: 'pyth', refAgeSec: 534 * H, pythAgeSec: 534 * H }, true);
  assert.equal(pythFlags, 'REF STALE (534h old)');
});

test('runPegWatch: Pyth unreadable, fresh issuer quote -> premium vs the quote, labelled', async () => {
  const MINT = 'MintPresent1111111111111111111111111111111';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('api.jup.ag/price')) return new Response(JSON.stringify({ [MINT]: { usdPrice: 216.11, blockId: 1, decimals: 8 } }), { status: 200 });
    if (u.includes('hermes')) return new Response('[]', { status: 200 });
    return new Response('{"jsonrpc":"2.0","id":1,"error":{"message":"offline fixture"}}', { status: 200 }); // RPC
  };
  try {
    const stocks = [{ symbol: 'NVDAx', underlying: 'NVDA', mint: MINT, pythFeedId: '00'.repeat(32), pythSymbol: 'Equity.US.NVDA/USD', pythOnChainAccounts: [] }];
    const issuer = {
      fetched_at: new Date().toISOString(),
      assets: [{ symbol: 'NVDAx', quote: { ok: true, quote: 216.34, fetched_at: new Date(Date.now() - 5 * 60_000).toISOString() } }],
    };
    const [row] = (await runPegWatch({ stocks, issuer })).rows;
    assert.equal(row.refSource, 'issuer');
    assert.equal(row.refUsd, 216.34);
    assert.equal(row.premiumBps, Math.round((216.11 / 216.34 - 1) * 10000)); // -11, not the -490 a stale Pyth gives
    assert.equal(row.quoteVsPyth.status, 'UNKNOWN'); // compared with Pyth itself, not with the quote
    assert.match(row.flags, /^REF: xStocks quote \(Pyth UNKNOWN\)/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
