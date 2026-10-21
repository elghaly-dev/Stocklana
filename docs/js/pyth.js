import { ENDPOINTS, PYTH_PROGRAMS, THRESHOLDS } from './config.js';

const PYTH_PUSH_ORACLE = 'pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT';
/** Price update accounts are owned by the Pyth Solana Receiver program. */
const PYTH_RECEIVER = PYTH_PROGRAMS.current.receiver;
const RECEIVERS = { [PYTH_PROGRAMS.current.receiver]: 'current', [PYTH_PROGRAMS.upgraded.receiver]: 'upgraded' };

function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

function readInt64LE(buf, offset) {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return Number(view.getBigInt64(0, true));
}

function readUInt64LE(buf, offset) {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return Number(view.getBigUint64(0, true));
}

function readInt32LE(buf, offset) {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return view.getInt32(0, true);
}

function indexOfSubarray(haystack, needle) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Parse a Pyth push-oracle PriceUpdateV2 account (~134 bytes).
 */
export function parsePythPushAccount(data, expectedFeedIdHex) {
  const buf = toUint8(data);
  if (buf.length < 126) {
    return { ok: false, error: 'account too short' };
  }

  const feedBytes = hexToBytes(expectedFeedIdHex);
  const feedOffset = indexOfSubarray(buf, feedBytes);
  if (feedOffset < 0) {
    return { ok: false, error: 'feed id not found in account' };
  }

  const price = readInt64LE(buf, feedOffset + 32);
  const conf = readUInt64LE(buf, feedOffset + 40);
  const expo = readInt32LE(buf, feedOffset + 48);
  const publishTime = readInt64LE(buf, feedOffset + 52);

  if (!Number.isFinite(price) || publishTime <= 0) {
    return { ok: false, error: 'invalid price fields' };
  }

  const usd = price * 10 ** expo;
  return {
    ok: true,
    priceUsd: usd,
    confUsd: conf * 10 ** expo,
    expo,
    publishTime,
    source: 'pyth-on-chain',
  };
}

async function rpcCall(rpcUrl, method, params) {
  const doFetch = () =>
    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  let res = await doFetch();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await doFetch();
  }
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} (${new URL(rpcUrl).host})`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

export async function fetchCurrentSlot(rpcUrls = ENDPOINTS.solanaRpc) {
  for (const url of rpcUrls) {
    try {
      const slot = await rpcCall(url, 'getSlot', [{ commitment: 'confirmed' }]);
      return { slot, rpc: url };
    } catch {
      /* try next */
    }
  }
  return { slot: null, rpc: null };
}

/**
 * Seconds per slot from getRecentPerformanceSamples (each sample: slots produced in a ~60 s window).
 * @returns {{ slotSeconds: number|null, windowSeconds: number|null }}
 */
export function slotSecondsFromSamples(samples) {
  let seconds = 0;
  let slots = 0;
  for (const s of Array.isArray(samples) ? samples : []) {
    if (s?.numSlots > 0 && s?.samplePeriodSecs > 0) {
      seconds += s.samplePeriodSecs;
      slots += s.numSlots;
    }
  }
  return slots > 0 ? { slotSeconds: seconds / slots, windowSeconds: seconds } : { slotSeconds: null, windowSeconds: null };
}

/**
 * Current Solana slot rate, measured over the last THRESHOLDS.slotRateSamples performance samples.
 * @returns {Promise<{ slotSeconds: number|null, windowSeconds: number|null, rpc: string|null, error?: string }>}
 */
export async function fetchSlotSeconds(rpcUrls = ENDPOINTS.solanaRpc, samples = THRESHOLDS.slotRateSamples) {
  const errs = [];
  for (const url of rpcUrls) {
    try {
      const rate = slotSecondsFromSamples(await rpcCall(url, 'getRecentPerformanceSamples', [samples]));
      if (rate.slotSeconds == null) throw new Error('no usable performance samples');
      return { ...rate, rpc: url };
    } catch (e) {
      errs.push(`${new URL(url).host}: ${e.message || e}`);
    }
  }
  return { slotSeconds: null, windowSeconds: null, rpc: null, error: `slot rate: ${errs.join('; ')}` };
}

/**
 * Read all candidate push-oracle accounts (shard 0 / shard 1) for every stock in ONE
 * getMultipleAccounts call (public RPCs rate-limit bursts), and per stock return the
 * account with the most recent valid publishTime for the expected feed id.
 * @returns {Promise<{ results: object[], slot: number|null, rpc: string|null }>}
 */
export async function fetchPythOnChainBatch(stocks, rpcUrls = ENDPOINTS.solanaRpc) {
  const lists = stocks.map((s) =>
    (s.pythOnChainAccounts || [s.pythOnChainAccount]).map((a) => (typeof a === 'string' ? { address: a } : a)),
  );
  const all = lists.flat().map((a) => a.address);
  const errs = [];
  for (const url of rpcUrls) {
    try {
      // Public RPCs cap getMultipleAccounts (publicnode: 10 keys), so request in chunks of 10.
      const values = [];
      let result = null;
      for (let c = 0; c < all.length; c += 10) {
        result = await rpcCall(url, 'getMultipleAccounts', [
          all.slice(c, c + 10),
          { encoding: 'base64', commitment: 'confirmed' },
        ]);
        values.push(...(result?.value || []));
      }
      let k = 0;
      const results = stocks.map((stock, si) => {
        const parsed = lists[si].map((meta) => {
          const acct = meta.address;
          const value = values[k++];
          const tag = `${meta.program ?? '?'} shard ${meta.shard ?? '?'} ${acct}`;
          if (!value?.data?.[0]) return { ok: false, error: `${tag}: account does not exist` };
          if (!RECEIVERS[value.owner]) {
            return { ok: false, error: `${tag}: not owned by a Pyth receiver program` };
          }
          const p = parsePythPushAccount(base64ToBytes(value.data[0]), stock.pythFeedId);
          return p.ok
            ? { ...p, account: acct, program: meta.program ?? RECEIVERS[value.owner], shard: meta.shard ?? null, receiver: value.owner }
            : { ...p, error: `${tag}: ${p.error}` };
        });
        const good = parsed.filter((p) => p.ok).sort((a, b) => b.publishTime - a.publishTime);
        if (good.length) return { ...good[0], rpc: url, candidates: parsed.map((p) => (p.ok ? { account: p.account, program: p.program, shard: p.shard, publishTime: p.publishTime } : { error: p.error })) };
        return { ok: false, error: parsed.map((p) => p.error).join('; ') || 'no account data', rpc: url };
      });
      return { results, slot: result?.context?.slot ?? null, rpc: url };
    } catch (err) {
      errs.push(String(err.message || err));
    }
  }
  const error = errs.join('; ') || 'all RPC endpoints failed';
  return { results: stocks.map(() => ({ ok: false, error })), slot: null, rpc: null };
}

export async function fetchPythOnChain(stock, rpcUrls = ENDPOINTS.solanaRpc) {
  return (await fetchPythOnChainBatch([stock], rpcUrls)).results[0];
}

/** Hermes metadata endpoint (no API key) exposes market-hours per feed. */
export async function fetchPythMarketHours(stocks) {
  const map = new Map();
  await Promise.all(
    stocks.map(async (stock) => {
      try {
        const q = encodeURIComponent(stock.pythSymbol);
        const res = await fetch(`${ENDPOINTS.pythHermesMeta}?query=${q}`);
        if (!res.ok) return;
        const feeds = await res.json();
        const match = feeds.find((f) => f.attributes?.symbol === stock.pythSymbol);
        if (match?.market_hours) {
          map.set(stock.symbol, match.market_hours);
        }
      } catch {
        /* fall back to local schedule */
      }
    }),
  );
  return map;
}

export { PYTH_PUSH_ORACLE, PYTH_RECEIVER };
