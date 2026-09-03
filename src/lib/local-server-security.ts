const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function splitHost(value: string): { hostname: string; port: string } | null {
  const match = value.match(/^(localhost|127\.0\.0\.1|\[::1\]):(\d+)$/);
  return match ? { hostname: match[1], port: match[2] } : null;
}

export function isAllowedLocalHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const parsed = splitHost(host);
  return Boolean(parsed && LOOPBACK_HOSTS.has(parsed.hostname) && parsed.port === String(port));
}

export interface WebSocketUpgradeInput {
  host: string | undefined;
  origin: string | undefined;
  nonce: string | undefined;
  requestUrl?: string;
  expectedNonce: string;
  port: number;
}

export function isAllowedWebSocketUpgrade(input: WebSocketUpgradeInput): boolean {
  if (!isAllowedLocalHost(input.host, input.port)) return false;

  let nonce = input.nonce;
  if (input.requestUrl !== undefined) {
    try {
      const requestUrl = new URL(input.requestUrl, `http://localhost:${input.port}`);
      nonce = requestUrl.searchParams.get('nonce') || undefined;
    } catch {
      return false;
    }
  }

  if (!input.origin || !nonce || nonce !== input.expectedNonce) return false;
  try {
    const origin = new URL(input.origin);
    return origin.protocol === 'http:' && isAllowedLocalHost(origin.host, input.port);
  } catch {
    return false;
  }
}

export interface SameOriginRequestInput {
  method: string;
  host: string | undefined;
  origin: string | null | undefined;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request forgery guard for the local HTTP API.
 *
 * The server only ever binds to loopback, but any page in any browser on the
 * machine can still reach `http://localhost:<port>` — and a `text/plain` form
 * POST is a "simple request", so it is delivered without a CORS preflight.
 * The response stays unreadable, but the side effect (merging a kubeconfig,
 * deleting a context, applying a manifest) would already have happened.
 *
 * `Host` is validated separately by `isAllowedLocalHost` before the request
 * reaches Next, so comparing `Origin` against `Host` is sufficient here.
 */
export function isSameOriginRequest(input: SameOriginRequestInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (!input.host || !input.origin) return false;
  try {
    const origin = new URL(input.origin);
    if (origin.protocol !== 'http:') return false;
    return origin.host === input.host;
  } catch {
    return false;
  }
}
