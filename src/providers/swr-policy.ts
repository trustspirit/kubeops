/**
 * SWR cache and retry policy, kept free of React so it can be unit tested.
 */

/**
 * A size-bounded cache for SWR. Reads and writes refresh an entry's recency so
 * the hot keys of the current page are never the ones evicted, and eviction
 * only happens when a *new* key would push the cache over its limit —
 * re-writing an existing key (every revalidation does) must not drop another.
 */
export function createLRUCache<V = unknown>(maxSize = 500) {
  const map = new Map<string, V>();
  const touch = (key: string, value: V) => {
    map.delete(key);
    map.set(key, value);
  };
  return {
    get: (key: string): V | undefined => {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as V;
      touch(key, value);
      return value;
    },
    set: (key: string, value: V) => {
      if (map.has(key)) {
        touch(key, value);
        return;
      }
      while (map.size >= maxSize) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
      map.set(key, value);
    },
    delete: (key: string) => { map.delete(key); },
    keys: () => map.keys(),
  };
}

/** Statuses that will not fix themselves by retrying: auth, RBAC, not found, bad request. */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 405, 410, 422]);

/**
 * Transient failures — the network dropped (VPN, sleep), the request timed out
 * (408), the API server is overloaded (429) or errored (5xx) — keep retrying so
 * the page recovers on its own. SWR pauses `refreshInterval` polling while a
 * key is in error, so giving up here would leave the page stale forever.
 */
export function isRetryableError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  if (typeof status !== 'number') return true; // fetch() network failure, abort, etc.
  if (PERMANENT_STATUSES.has(status)) return false;
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return status < 400;
}

export const ERROR_RETRY_BASE_MS = 2_000;
export const ERROR_RETRY_MAX_MS = 30_000;

/** Exponential backoff with jitter, capped so a recovered network is noticed within ~30s. */
export function getErrorRetryDelay(
  retryCount: number,
  { baseMs = ERROR_RETRY_BASE_MS, maxMs = ERROR_RETRY_MAX_MS, random = Math.random } = {},
): number {
  const attempt = Math.max(0, retryCount - 1);
  const exponential = baseMs * 2 ** Math.min(attempt, 10);
  const jittered = exponential * (0.75 + random() * 0.5);
  return Math.round(Math.min(maxMs, jittered));
}
