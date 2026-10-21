import { STOCKS, THRESHOLDS } from './config.js';
import { fetchJupiterPrices, jupiterPriceAgeSeconds, jupiterPriceFor } from './jupiter.js';
import { fetchPythOnChainBatch, fetchPythMarketHours, fetchCurrentSlot, fetchSlotSeconds } from './pyth.js';
import { isUsMarketOpenLocal, marketStatusLabel, formatAgeSeconds } from './market.js';

function bpsDiff(onChain, reference) {
  if (onChain == null || reference == null || reference === 0) return null;
  return Math.round(((onChain - reference) / reference) * 10000);
}

function formatBps(bps) {
  if (bps == null || !Number.isFinite(bps)) return 'UNKNOWN';
  const sign = bps > 0 ? '+' : '';
  return `${sign}${bps}`;
}

function formatUsd(v) {
  if (v == null || !Number.isFinite(v)) return 'UNKNOWN';
  return v.toFixed(2);
}

/** MATCH within tolerance (fraction), else DIFF; UNKNOWN if either side missing. */
export function compare(a, b, tol = THRESHOLDS.referenceMatch) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return { status: 'UNKNOWN', diff: null };
  }
  const diff = a / b - 1;
  return { status: Math.abs(diff) <= tol ? 'MATCH' : 'DIFF', diff };
}

/**
 * Reference price for the premium. Pyth while it is at most maxRefAgeSeconds old. Otherwise the
 * xStocks issuer quote (price-data: USD per share, the same unit as Jupiter's per-UI-token price),
 * if that snapshot is at most issuerRefMaxAgeSeconds old. Otherwise Pyth as it is (flagged REF STALE).
 */
export function pickReference(pyth, quote, quoteFetchedAt, nowSec) {
  const pythUsd = pyth?.ok ? pyth.priceUsd : null;
  const pythAgeSec = pyth?.ok ? Math.max(0, nowSec - pyth.publishTime) : null;
  const pythFresh = pythUsd != null && pythAgeSec <= THRESHOLDS.maxRefAgeSeconds;
  const quoteAgeSec = quoteFetchedAt ? Math.max(0, nowSec - Math.floor(Date.parse(quoteFetchedAt) / 1000)) : null;
  const quoteUsable = Number.isFinite(quote) && quote > 0 && quoteAgeSec != null && quoteAgeSec <= THRESHOLDS.issuerRefMaxAgeSeconds;
  if (!pythFresh && quoteUsable) return { source: 'issuer', usd: quote, ageSec: quoteAgeSec, pythUsd, pythAgeSec };
  return { source: 'pyth', usd: pythUsd, ageSec: pythAgeSec, pythUsd, pythAgeSec };
}

function fmtCmp(c) {
  if (!c || c.status === 'UNKNOWN') return 'UNKNOWN';
  return `${c.status} ${c.diff >= 0 ? '+' : ''}${(c.diff * 100).toFixed(2)}%`;
}

export function computeFlags(row, marketOpen) {
  const flags = [];
  if (row.halted === true) {
    // Issuer reports trading halted: premium flags are suppressed for this row.
    flags.push('HALTED');
    if (row.errors.length) flags.push('UNKNOWN');
    return flags.join(', ');
  }
  const absBps = row.premiumBps == null ? null : Math.abs(row.premiumBps);

  if (absBps != null && absBps > THRESHOLDS.premiumBps) {
    flags.push(`WIDE (${absBps} bps)`);
  }

  if (row.refSource === 'issuer') {
    // Pyth is past maxRefAgeSeconds; the premium uses the issuer quote instead (see pickReference).
    const quoteAge = row.refAgeSec != null ? ` ${(row.refAgeSec / 3600).toFixed(1)}h old` : '';
    flags.push(`REF: xStocks quote${quoteAge} (Pyth ${row.pythAgeSec != null ? `${Math.round(row.pythAgeSec / 3600)}h old` : 'UNKNOWN'})`);
  } else if (row.refAgeSec != null && row.refAgeSec > THRESHOLDS.maxRefAgeSeconds) {
    flags.push(`REF STALE (${Math.round(row.refAgeSec / 3600)}h old)`);
  } else if (row.refAgeSec != null && marketOpen && row.refAgeSec > THRESHOLDS.staleSeconds) {
    flags.push('STALE');
  }

  if (!marketOpen && absBps != null && absBps > THRESHOLDS.premiumBps && row.refAgeSec != null && row.refAgeSec <= THRESHOLDS.maxRefAgeSeconds) {
    flags.push('AFTER-HOURS GAP');
  }

  if (row.errors.length) flags.push('UNKNOWN');
  return flags.length ? flags.join(', ') : 'OK';
}

/**
 * @returns {Promise<{ rows: object[], fetchedAt: string, marketOpen: boolean, marketLabel: string, slot: number|null }>}
 */
/**
 * @param {object} [opts]
 * @param {object|null} [opts.issuer] xStocks (Backed) snapshot as produced by fetchBackedSnapshot()
 *   (browser: xstocks.json on the data branch, written by the GitHub Action; CLI: fetched from the API on each run).
 */
export async function runPegWatch({ stocks = STOCKS, issuer = null, issuerError = null } = {}) {
  const fetchedAt = new Date();
  const mints = stocks.map((s) => s.mint);

  const [jupiter, pythBatch, marketHoursMap, slotRate] = await Promise.all([
    fetchJupiterPrices(mints),
    fetchPythOnChainBatch(stocks),
    fetchPythMarketHours(stocks),
    fetchSlotSeconds(),
  ]);
  const pythResults = pythBatch.results;
  // Slot comes from the same RPC response; only fall back to a separate getSlot if needed.
  const slotInfo = pythBatch.slot != null ? { slot: pythBatch.slot } : await fetchCurrentSlot();

  const localOpen = isUsMarketOpenLocal(fetchedAt);
  const anyPythOpen = [...marketHoursMap.values()].some((h) => h.is_open);
  const marketOpen = marketHoursMap.size > 0 ? anyPythOpen : localOpen;
  const marketLabel = marketStatusLabel(marketOpen);

  const nowSec = Math.floor(fetchedAt.getTime() / 1000);

  const rows = stocks.map((stock, i) => {
    const jp = jupiter.ok ? jupiterPriceFor(jupiter.prices, stock.mint) : { usd: null, entry: null, reason: null };
    const jEntry = jp.entry;
    const onChainUsd = jp.usd;
    const onChainAgeSec = jupiterPriceAgeSeconds(jEntry, slotInfo.slot, slotRate.slotSeconds);

    const pyth = pythResults[i];
    const iss = issuer?.assets?.find((a) => a.symbol === stock.symbol) || null;
    const quote = iss?.quote?.ok ? iss.quote.quote : null;
    const ref = pickReference(pyth, quote, iss?.quote?.fetched_at ?? null, nowSec);
    const refUsd = ref.usd;
    const refAgeSec = ref.ageSec;

    // Multiplier handling (verified against Jupiter scaledUiConfig and the Token-2022 mint):
    // Jupiter usdPrice is per SCALED (UI) unit = 1 underlying share, so premium = usdPrice / Pyth - 1.
    // Equivalent raw-token view: raw price = usdPrice x M, fair value per raw token = underlying x M.
    const mult = iss?.multiplier?.ok ? iss.multiplier.currentMultiplier : null;
    const premiumBps = bpsDiff(onChainUsd, refUsd);
    const halted = iss?.asset?.ok ? iss.asset.isTradingHalted : null;
    const issuerErrors = [];
    if (!issuer) issuerErrors.push(`xStocks snapshot: ${issuerError || 'not loaded'}`);
    else if (!iss) issuerErrors.push('xStocks snapshot: symbol missing');
    else {
      for (const k of ['quote', 'multiplier', 'asset']) if (!iss[k]?.ok) issuerErrors.push(`xStocks ${k}: ${iss[k]?.error || 'missing'}`);
    }
    const stockMarketHours = marketHoursMap.get(stock.symbol);
    const stockMarketOpen =
      stockMarketHours?.is_open != null ? stockMarketHours.is_open : localOpen;

    const row = {
      symbol: stock.symbol,
      underlying: stock.underlying,
      mint: stock.mint,
      onChainUsd,
      onChainAgeSec,
      onChainAge: formatAgeSeconds(onChainAgeSec),
      refUsd,
      refAgeSec,
      refAge: formatAgeSeconds(refAgeSec),
      refSource: ref.source,
      pythUsd: ref.pythUsd,
      pythAgeSec: ref.pythAgeSec,
      premiumBps,
      premiumBpsLabel: formatBps(premiumBps),
      market: marketStatusLabel(stockMarketOpen),
      refPublishTime: pyth.ok ? new Date(pyth.publishTime * 1000).toISOString() : null,
      refAccount: pyth.ok ? pyth.account : null,
      refProgram: pyth.ok ? pyth.program ?? null : null,
      refShard: pyth.ok ? pyth.shard ?? null : null,
      quote,
      quoteFetchedAt: iss?.quote?.fetched_at ?? null,
      quoteVsJupiter: compare(quote, onChainUsd),
      quoteVsPyth: compare(quote, ref.pythUsd),
      multiplier: mult,
      multiplierFetchedAt: iss?.multiplier?.fetched_at ?? null,
      multiplierReason: iss?.multiplier?.reason ?? null,
      multiplierCheck: iss?.multiplier_check ?? null,
      jupiterRawUsd: onChainUsd != null && mult != null ? onChainUsd * mult : null,
      fairRawUsd: refUsd != null && mult != null ? refUsd * mult : null,
      halted,
      haltedFetchedAt: iss?.asset?.fetched_at ?? null,
      proofOfReserves: iss?.proof_of_reserves ?? null,
      corporateActions: iss?.corporate_actions ?? null,
      pendingMultiplier: iss?.pending_multiplier ?? null,
      issuerHost: iss?.quote?.host ?? null,
      issuerErrors,
      flags: '',
      errors: [],
    };

    if (!jupiter.ok) row.errors.push(`Jupiter: ${jupiter.error}`);
    if (jupiter.ok && jp.reason) row.errors.push(jp.reason);
    if (!pyth.ok) row.errors.push(`Pyth: ${pyth.error}`);

    row.flags = computeFlags(row, stockMarketOpen);
    return row;
  });

  return {
    rows,
    issuerFetchedAt: issuer?.fetched_at ?? null,
    fetchedAt: fetchedAt.toISOString(),
    marketOpen,
    marketLabel,
    slot: slotInfo.slot,
    slotRate,
  };
}

/** e.g. "0.218 s/slot (measured over 300 s)"; UNKNOWN with the reason when the RPC gave no samples. */
export function formatSlotRate(rate) {
  if (!(rate?.slotSeconds > 0)) return `UNKNOWN${rate?.error ? ` — ${rate.error}` : ''}`;
  return `${rate.slotSeconds.toFixed(3)} s/slot (measured over ${Math.round(rate.windowSeconds)} s)`;
}

export function formatTable(result) {
  const header = [
    'Symbol',
    'On-chain $',
    'On-chain age',
    'Ref $',
    'Ref age',
    'Premium bps',
    'xStocks quote',
    'quote vs Jup',
    'quote vs Pyth',
    'Multiplier',
    'US market',
    'Flags',
  ];

  const lines = [header.join('\t')];
  for (const r of result.rows) {
    lines.push(
      [
        r.symbol,
        formatUsd(r.onChainUsd),
        r.onChainAge,
        `${formatUsd(r.refUsd)}${r.refSource === 'issuer' ? ' (xStocks quote)' : ''}`,
        r.refAge,
        r.premiumBpsLabel,
        formatUsd(r.quote),
        fmtCmp(r.quoteVsJupiter),
        fmtCmp(r.quoteVsPyth),
        r.multiplier != null ? r.multiplier.toFixed(6) : 'UNKNOWN',
        r.market,
        r.flags,
      ].join('\t'),
    );
  }
  lines.push('');
  lines.push(`Fetched: ${result.fetchedAt} (xStocks issuer data fetched ${result.issuerFetchedAt ?? 'UNKNOWN'})`);
  for (const r of result.rows) {
    if (r.errors.length) lines.push(`${r.symbol}: UNKNOWN — ${r.errors.join('; ')}`);
    if (r.issuerErrors.length) lines.push(`${r.symbol}: ${r.issuerErrors.join('; ')}`);
  }
  lines.push(`US market (aggregate): ${result.marketLabel}`);
  lines.push(`Slot rate (on-chain age): ${formatSlotRate(result.slotRate)}`);
  return lines.join('\n');
}
