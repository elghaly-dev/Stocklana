#!/usr/bin/env node
/**
 * Depth-adjusted premiums + history (read-only; Jupiter QUOTE API only — never builds or sends a swap).
 *
 * For every PreStocks token (from docs/data/prestocks.json) and every tracked xStock:
 *   - buy:  quote USDC -> token, ExactIn, $1,000 and $10,000
 *   - sell: quote token -> USDC, ExactIn, token amount worth ~$1,000 / ~$10,000 at the Jupiter price
 * Effective price per token is expressed per SCALED (UI) token: Jupiter quote amounts are RAW units,
 * so UI tokens = raw / 10^decimals × effective Token-2022 ScaledUiAmount multiplier (read from the mint).
 * Premium vs reference: PreStocks -> markPrice (as published by the PreStocks API); xStocks -> Pyth Equity.US price,
 * or the xStocks issuer quote from docs/data/xstocks.json when Pyth is stale (pickReference in docs/js/peg-watch.js).
 * Price impact % = effective price / Jupiter Price API usdPrice − 1 (our own computation; Jupiter's
 * priceImpactPct field is stored verbatim as jupiter_price_impact_pct).
 *
 * Writes docs/data/depth.json and appends one point to docs/data/history.json (capped at 14 days).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCKS } from '../docs/js/config.js';
import { fetchPythOnChainBatch } from '../docs/js/pyth.js';
import { pickReference } from '../docs/js/peg-watch.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'docs/data');
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const QUOTE_HOSTS = ['https://lite-api.jup.ag/swap/v1/quote', 'https://api.jup.ag/swap/v1/quote'];
const QUOTE = QUOTE_HOSTS[0];
let quoteCounter = 0;
const PRICE = 'https://api.jup.ag/price/v3';
const RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const SIZES = [1000, 10000];
const HISTORY_DAYS = 14;
const UA = 'Stocklana-PegWatch/1.0 (+https://github.com/Alarm2024/Stocklana; read-only quotes)';

const now = () => new Date().toISOString();
const errMsg = (e) => String(e?.message || e);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}${body?.error ? `: ${body.error}` : body?.errorCode ? `: ${body.errorCode}` : ''}`);
    e.status = res.status;
    e.body = body;
    throw e;
  }
  return body;
}

async function rpc(method, params) {
  let last;
  for (const url of RPCS) {
    try {
      const j = await getJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (j.error) throw new Error(j.error.message || 'RPC error');
      return j.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** decimals + effective ScaledUiAmount multiplier per mint (1 if the extension is absent). */
async function mintInfo(mints) {
  const fetched_at = now();
  const out = {};
  try {
    const r = await rpc('getMultipleAccounts', [mints, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    const nowSec = Math.floor(Date.now() / 1000);
    mints.forEach((m, i) => {
      const info = r?.value?.[i]?.data?.parsed?.info;
      if (!info || !Number.isInteger(info.decimals)) {
        out[m] = { ok: false, error: 'mint account not found / not parsed', fetched_at };
        return;
      }
      const ext = (info.extensions || []).find((e) => e.extension === 'scaledUiAmountConfig');
      let multiplier = 1;
      if (ext) {
        const s = ext.state;
        const ts = Number(s.newMultiplierEffectiveTimestamp);
        multiplier = ts > 0 && nowSec >= ts ? Number(s.newMultiplier) : Number(s.multiplier);
      }
      out[m] = Number.isFinite(multiplier) && multiplier > 0
        ? { ok: true, decimals: info.decimals, multiplier, fetched_at }
        : { ok: false, error: 'unparseable multiplier', fetched_at };
    });
  } catch (e) {
    for (const m of mints) out[m] = { ok: false, error: `RPC: ${errMsg(e)}`, fetched_at };
  }
  return out;
}

async function quote(inputMint, outputMint, amountRaw) {
  const qs = `?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=50&swapMode=ExactIn`;
  for (let attempt = 0; attempt < 5; attempt++) {
    // alternate between the two keyless public quote hosts to spread rate limits
    const url = QUOTE_HOSTS[quoteCounter++ % QUOTE_HOSTS.length] + qs;
    try {
      return { ok: true, q: await getJson(url), host: new URL(url).host };
    } catch (e) {
      if (e.status === 429) {
        await sleep(6000 * (attempt + 1));
        continue;
      }
      const code = e.body?.errorCode || e.body?.error || '';
      if (/NO_ROUTES|COULD_NOT_FIND|No routes|ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT/i.test(String(code))) {
        return { ok: false, noRoute: true, error: String(code) };
      }
      return { ok: false, error: errMsg(e) };
    }
  }
  return { ok: false, error: 'HTTP 429 (rate limited) after retries' };
}

/** One side at one size. Returns effective price per UI token, premium vs ref, impact vs Jupiter price. */
async function depthLeg({ side, usd, mint, mi, jupPrice, ref }) {
  const fetched_at = now();
  const base = { side, usd, fetched_at };
  if (!mi.ok) return { ...base, status: 'UNKNOWN', error: `mint info: ${mi.error}` };
  const scale = 10 ** mi.decimals;
  let r;
  let uiTokens;
  let usdc;
  if (side === 'buy') {
    r = await quote(USDC, mint, Math.round(usd * 1e6));
    if (r.ok) {
      uiTokens = (Number(r.q.outAmount) / scale) * mi.multiplier;
      usdc = Number(r.q.inAmount) / 1e6;
    }
  } else {
    if (!isNum(jupPrice)) return { ...base, status: 'UNKNOWN', error: 'no Jupiter price to size the sell' };
    const rawAmount = Math.round(((usd / jupPrice) / mi.multiplier) * scale);
    r = await quote(mint, USDC, rawAmount);
    if (r.ok) {
      uiTokens = (Number(r.q.inAmount) / scale) * mi.multiplier;
      usdc = Number(r.q.outAmount) / 1e6;
    }
  }
  if (!r.ok) return { ...base, status: r.noRoute ? 'NO ROUTE' : 'UNKNOWN', error: r.error };
  if (!(uiTokens > 0) || !(usdc > 0)) return { ...base, status: 'UNKNOWN', error: 'zero amount in quote' };
  const eff = usdc / uiTokens;
  return {
    ...base,
    status: 'OK',
    usdc,
    ui_tokens: uiTokens,
    effective_price: eff,
    premium_vs_ref: isNum(ref) ? eff / ref - 1 : null,
    price_impact_vs_jupiter_price: isNum(jupPrice) ? eff / jupPrice - 1 : null,
    jupiter_price_impact_pct: r.q.priceImpactPct ?? null,
    route: (r.q.routePlan || []).map((p) => p.swapInfo?.label).filter(Boolean),
    context_slot: r.q.contextSlot ?? null,
    quote_host: r.host ?? null,
  };
}

async function main() {
  const started = now();
  const pre = JSON.parse(await readFile(resolve(DATA, 'prestocks.json'), 'utf8'));
  const preTokens = (pre.tokens || []).filter((t) => t.mint);

  const items = [
    ...preTokens.map((t) => ({
      group: 'prestocks',
      symbol: t.symbol,
      mint: t.mint,
      ref: t.prestocks?.markPrice ?? null,
      ref_label: 'PreStocks markPrice (as published by the PreStocks API)',
      ref_fetched_at: t.prestocks?.fetched_at ?? null,
      headline_premium: t.premium ?? null,
      headline_fetched_at: t.prestocks?.fetched_at ?? null,
    })),
    ...STOCKS.map((s) => ({ group: 'xstocks', symbol: s.symbol, mint: s.mint, stock: s })),
  ];
  const mints = items.map((i) => i.mint);

  // Jupiter spot prices (one batch) + Pyth references for xStocks + mint info.
  const priceFetchedAt = now();
  let prices = {};
  let priceErr = null;
  try {
    prices = await getJson(`${PRICE}?ids=${mints.join(',')}`);
  } catch (e) {
    priceErr = `Jupiter price: ${errMsg(e)}`;
  }
  const pythFetchedAt = now();
  const pyth = await fetchPythOnChainBatch(STOCKS);
  // xStocks issuer snapshot written earlier in the same run (fetch-xstocks.mjs): the reference when Pyth is stale.
  let issuer = null;
  try {
    issuer = JSON.parse(await readFile(resolve(DATA, 'xstocks.json'), 'utf8'));
  } catch (e) {
    console.warn(`xstocks.json not readable, xStocks reference stays Pyth: ${e.message || e}`);
  }
  const mi = await mintInfo(mints);

  const out = [];
  for (const it of items) {
    const jp = prices?.[it.mint]?.usdPrice;
    const jupPrice = isNum(jp) ? jp : null;
    if (it.group === 'xstocks') {
      const p = pyth.results[STOCKS.indexOf(it.stock)];
      const iss = issuer?.assets?.find((a) => a.symbol === it.symbol) || null;
      const ref = pickReference(p, iss?.quote?.ok ? iss.quote.quote : null, iss?.quote?.fetched_at ?? null, Math.floor(Date.now() / 1000));
      it.ref = ref.usd;
      it.ref_label = ref.source === 'issuer' ? 'xStocks issuer quote (Pyth Equity.US price is stale)' : 'Pyth Equity.US price (on-chain)';
      it.ref_fetched_at = ref.source === 'issuer' ? iss.quote.fetched_at : pythFetchedAt;
      it.ref_error = ref.usd != null ? null : p?.error;
      it.headline_premium = jupPrice != null && it.ref != null ? jupPrice / it.ref - 1 : null;
      it.headline_fetched_at = priceFetchedAt;
      delete it.stock;
    }
    const legs = {};
    for (const usd of SIZES) {
      for (const side of ['buy', 'sell']) {
        legs[`${side}_${usd}`] = await depthLeg({ side, usd, mint: it.mint, mi: mi[it.mint], jupPrice, ref: it.ref });
        await sleep(1100); // stay well under the public quote API rate limit
      }
    }
    out.push({
      ...it,
      jupiter_price: jupPrice,
      jupiter_price_fetched_at: priceFetchedAt,
      ...(jupPrice == null ? { jupiter_price_error: priceErr || 'Jupiter omitted: no reliable price' } : {}),
      mint_info: mi[it.mint],
      legs,
    });
    const f = (l) => (l.status === 'OK' ? `${(l.premium_vs_ref * 100).toFixed(2)}%` : l.status);
    console.log(
      `${it.group}\t${it.symbol}\thead ${it.headline_premium == null ? 'UNKNOWN' : (it.headline_premium * 100).toFixed(2) + '%'}\tbuy1k ${f(legs.buy_1000)}\tsell1k ${f(legs.sell_1000)}\tbuy10k ${f(legs.buy_10000)}\tsell10k ${f(legs.sell_10000)}`,
    );
  }

  const depth = {
    fetched_at: started,
    completed_at: now(),
    sources: { quote: QUOTE_HOSTS, price: PRICE, solana_rpc: RPCS },
    sizes_usd: SIZES,
    note: 'Indicative Jupiter quotes only (quote API, slippageBps=50). Not executable guarantees, not arbitrage.',
    tokens: out,
  };
  await writeFile(resolve(DATA, 'depth.json'), JSON.stringify(depth, null, 2) + '\n');

  // History: one point per run, append-only, capped to HISTORY_DAYS.
  const hp = resolve(DATA, 'history.json');
  let hist;
  try {
    hist = JSON.parse(await readFile(hp, 'utf8'));
  } catch {
    hist = { version: 1, cap_days: HISTORY_DAYS, points: [] };
  }
  const num = (v) => (isNum(v) ? Number(v.toFixed(6)) : null);
  const point = { t: started, source: 'action', prestocks: {}, xstocks: {} };
  for (const r of out) {
    point[r.group][r.symbol] = {
      p: num(r.headline_premium),
      b10k: r.legs.buy_10000.status === 'OK' ? num(r.legs.buy_10000.premium_vs_ref) : null,
      s10k: r.legs.sell_10000.status === 'OK' ? num(r.legs.sell_10000.premium_vs_ref) : null,
    };
  }
  hist.points.push(point);
  const cutoff = Date.now() - HISTORY_DAYS * 86400000;
  hist.points = hist.points.filter((p) => new Date(p.t).getTime() >= cutoff).sort((a, b) => a.t.localeCompare(b.t));
  hist.updated_at = now();
  await writeFile(hp, JSON.stringify(hist, null, 1) + '\n');
  console.log('history points', hist.points.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
