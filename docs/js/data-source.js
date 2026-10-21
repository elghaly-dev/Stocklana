/**
 * Snapshot files (prestocks.json, xstocks.json, depth.json, history.json) are written by the
 * "Data snapshots" Action to the `data` branch. The page reads each one from the first source in
 * DATA_SOURCES that answers; the last source is the copy bundled with the site in docs/data/.
 * `fallback` is true when the bundled copy was used, so the caller can say so.
 */
import { DATA_SOURCES } from './config.js';

export async function fetchSnapshot(name, { fetchImpl = (...a) => fetch(...a), sources = DATA_SOURCES } = {}) {
  const errors = [];
  for (const [i, base] of sources.entries()) {
    const url = `${base}${name}`;
    try {
      const res = await fetchImpl(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { data: await res.json(), url, fallback: i > 0 };
    } catch (e) {
      errors.push(`${url}: ${e.message || e}`);
    }
  }
  throw new Error(errors.join('; '));
}
