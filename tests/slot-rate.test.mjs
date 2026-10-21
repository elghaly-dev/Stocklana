// On-chain age uses the slot rate measured from getRecentPerformanceSamples, never an assumed 0.4 s/slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { slotSecondsFromSamples, fetchSlotSeconds } from '../docs/js/pyth.js';
import { jupiterPriceAgeSeconds } from '../docs/js/jupiter.js';
import { formatSlotRate } from '../docs/js/peg-watch.js';
import { THRESHOLDS } from '../docs/js/config.js';

// Shape of a real mainnet reply (2026-10-20): ~275 slots per 60 s sample.
const SAMPLES = [
  { slot: 400001100, numSlots: 276, numTransactions: 1, samplePeriodSecs: 60 },
  { slot: 400000824, numSlots: 274, numTransactions: 1, samplePeriodSecs: 60 },
];

test('slotSecondsFromSamples: total seconds / total slots', () => {
  const r = slotSecondsFromSamples(SAMPLES);
  assert.equal(r.windowSeconds, 120);
  assert.ok(Math.abs(r.slotSeconds - 120 / 550) < 1e-12);
});

test('slotSecondsFromSamples: empty or zero samples -> null, never a default', () => {
  assert.deepEqual(slotSecondsFromSamples([]), { slotSeconds: null, windowSeconds: null });
  assert.deepEqual(slotSecondsFromSamples(null), { slotSeconds: null, windowSeconds: null });
  assert.deepEqual(slotSecondsFromSamples([{ numSlots: 0, samplePeriodSecs: 60 }]), { slotSeconds: null, windowSeconds: null });
});

test('no hard-coded slot duration left in config', () => {
  assert.equal(THRESHOLDS.slotSeconds, undefined);
});

test('jupiterPriceAgeSeconds: uses the measured rate; no rate -> null (UNKNOWN)', () => {
  const entry = { blockId: 1000 };
  assert.equal(jupiterPriceAgeSeconds(entry, 1100, 0.218), 22); // 100 slots * 0.218 s
  assert.equal(jupiterPriceAgeSeconds(entry, 1100, null), null);
  assert.equal(jupiterPriceAgeSeconds(entry, 1100, 0), null);
  assert.equal(jupiterPriceAgeSeconds(entry, 900, 0.218), 0); // blockId ahead of slot -> 0, not negative
});

test('fetchSlotSeconds: asks RPC for samples, falls through to the next RPC on error', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push([String(url), body.method, body.params]);
    if (String(url).includes('bad')) return new Response('{"jsonrpc":"2.0","id":1,"error":{"message":"down"}}', { status: 200 });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: SAMPLES }), { status: 200 });
  };
  try {
    const r = await fetchSlotSeconds(['https://bad.example', 'https://good.example'], 5);
    assert.equal(r.rpc, 'https://good.example');
    assert.equal(r.windowSeconds, 120);
    assert.deepEqual(calls[1].slice(1), ['getRecentPerformanceSamples', [5]]);
    const none = await fetchSlotSeconds(['https://bad.example'], 5);
    assert.equal(none.slotSeconds, null);
    assert.match(none.error, /bad\.example: .*down/);
    assert.match(formatSlotRate(none), /^UNKNOWN — slot rate: /);
    assert.equal(formatSlotRate(r), `${(120 / 550).toFixed(3)} s/slot (measured over 120 s)`);
  } finally {
    globalThis.fetch = realFetch;
  }
});
