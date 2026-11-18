/** fetch with a hard timeout, so a stalled request becomes an error instead of an endless "Loading…". */
export const FETCH_TIMEOUT_MS = 3000;

export function fetchWithTimeout(url, init = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal })
    .catch((e) => {
      if (ctrl.signal.aborted) throw new Error(`timed out after ${ms / 1000}s`);
      throw e;
    })
    .finally(() => clearTimeout(timer));
}
