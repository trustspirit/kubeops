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
