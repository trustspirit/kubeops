/**
 * Server-side single-flight for provider logins.
 *
 * The renderer already dedupes its own requests, but a second window, a
 * reconnecting page or a retry after a client-side timeout can still POST the
 * same login while the first SSO flow is waiting in the browser — and each
 * POST used to open another browser tab. Identical (provider, config) pairs
 * now share one CLI run and one result.
 */

type LoginResult = { success: boolean; output?: string; error?: string };

const IN_FLIGHT_KEY = Symbol.for('kubeops.loginInFlight');

function inFlight(): Map<string, Promise<LoginResult>> {
  const store = globalThis as typeof globalThis & { [IN_FLIGHT_KEY]?: Map<string, Promise<LoginResult>> };
  if (!store[IN_FLIGHT_KEY]) store[IN_FLIGHT_KEY] = new Map();
  return store[IN_FLIGHT_KEY];
}

/** Stable key: config key order must not create a second flow. */
export function loginKey(providerId: string, config: Record<string, string>): string {
  const normalized = Object.entries(config).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([providerId, normalized]);
}

export function runLoginOnce(
  providerId: string,
  config: Record<string, string>,
  login: () => Promise<LoginResult>,
): Promise<LoginResult> {
  const key = loginKey(providerId, config);
  const map = inFlight();
  const current = map.get(key);
  if (current) return current;

  const promise = Promise.resolve()
    .then(login)
    .finally(() => {
      if (map.get(key) === promise) map.delete(key);
    });
  map.set(key, promise);
  return promise;
}
