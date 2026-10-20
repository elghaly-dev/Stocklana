import { ENDPOINTS } from './config.js';

export async function fetchJupiterPrices(mints) {
  const ids = mints.join(',');
  try {
    const res = await fetch(`${ENDPOINTS.jupiterPrice}?ids=${ids}`);
    if (!res.ok) {
      return { ok: false, error: `Jupiter HTTP ${res.status}`, prices: {} };
    }
    const data = await res.json();
    return { ok: true, prices: data || {} };
  } catch (err) {
    return { ok: false, error: `Jupiter fetch failed: ${err.message || err}`, prices: {} };
  }
}

/**
 * Estimate Jupiter price age from blockId vs current slot, at the measured seconds per slot
 * (fetchSlotSeconds). Jupiter v3 does not expose a publish timestamp directly.
 * No measured rate -> null (UNKNOWN), never an assumed slot time.
 */
export function jupiterPriceAgeSeconds(jupiterEntry, currentSlot, slotSeconds) {
  if (!jupiterEntry || jupiterEntry.blockId == null || currentSlot == null || !(slotSeconds > 0)) {
    return null;
  }
  const slotsBehind = Math.max(0, currentSlot - jupiterEntry.blockId);
  return Math.round(slotsBehind * slotSeconds);
}

export function extractJupiterUsd(jupiterEntry) {
  if (!jupiterEntry || typeof jupiterEntry.usdPrice !== 'number') {
    return null;
  }
  return jupiterEntry.usdPrice;
}

/** Reason text used everywhere a mint key is absent from the Jupiter Price API v3 response. */
export const JUPITER_OMITTED = 'Jupiter omitted: no reliable price';

/**
 * Jupiter Price API v3 leaves tokens without a reliable price OUT of the response entirely
 * (no key, no null, no error). Map that to UNKNOWN with a reason — never 0.
 * @returns {{ usd: number|null, entry: object|null, reason: string|null }}
 */
export function jupiterPriceFor(prices, mint) {
  const entry = prices && Object.prototype.hasOwnProperty.call(prices, mint) ? prices[mint] : null;
  if (!entry) return { usd: null, entry: null, reason: JUPITER_OMITTED };
  const usd = extractJupiterUsd(entry);
  if (usd == null || !(usd > 0)) return { usd: null, entry, reason: 'Jupiter returned no usable usdPrice' };
  return { usd, entry, reason: null };
}
