// The page reads snapshot JSON from the `data` branch first and falls back to the copy bundled
// in docs/data/. A failure must name every source that was tried, never return empty data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSnapshot } from '../docs/js/data-source.js';
import { DATA_SOURCES } from '../docs/js/config.js';

const BRANCH = 'https://raw.example/data/';
const BUNDLED = 'data/';
const sources = [BRANCH, BUNDLED];

function fakeFetch(replies) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const reply = replies[url.split('?')[0]];
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'number') return { ok: false, status: reply, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => reply };
  };
  return { fetchImpl, calls };
}

test('reads the data branch first', async () => {
  const { fetchImpl, calls } = fakeFetch({ [`${BRANCH}x.json`]: { from: 'branch' }, [`${BUNDLED}x.json`]: { from: 'bundled' } });
  const r = await fetchSnapshot('x.json', { fetchImpl, sources });
  assert.deepEqual(r, { data: { from: 'branch' }, url: `${BRANCH}x.json`, fallback: false });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/raw\.example\/data\/x\.json\?t=\d+$/);
});

test('falls back to the bundled copy on 404 or a network error', async () => {
  for (const failure of [404, new TypeError('Failed to fetch')]) {
    const { fetchImpl } = fakeFetch({ [`${BRANCH}x.json`]: failure, [`${BUNDLED}x.json`]: { from: 'bundled' } });
    const r = await fetchSnapshot('x.json', { fetchImpl, sources });
    assert.deepEqual(r, { data: { from: 'bundled' }, url: `${BUNDLED}x.json`, fallback: true });
  }
});

test('throws with every source and reason when all fail', async () => {
  const { fetchImpl } = fakeFetch({ [`${BRANCH}x.json`]: 503, [`${BUNDLED}x.json`]: new TypeError('offline') });
  await assert.rejects(fetchSnapshot('x.json', { fetchImpl, sources }), {
    message: `${BRANCH}x.json: HTTP 503; ${BUNDLED}x.json: offline`,
  });
});

test('default sources: data branch of this repo, then the bundled copy', () => {
  assert.deepEqual(DATA_SOURCES, ['https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/', 'data/']);
});
