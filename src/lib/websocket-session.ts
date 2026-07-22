let noncePromise: Promise<string> | null = null;

export function getWebSocketNonce(): Promise<string> {
  noncePromise ??= fetch('/api/session', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to establish a local WebSocket session');
      const body = await response.json() as { nonce?: string };
      if (!body.nonce) throw new Error('Local WebSocket session did not return a nonce');
      return body.nonce;
    })
    .catch((error) => {
      noncePromise = null;
      throw error;
    });
  return noncePromise;
}

export async function buildWebSocketUrl(path: string): Promise<string> {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(path, `${protocol}//${window.location.host}`);
  url.searchParams.set('nonce', await getWebSocketNonce());
  return url.toString();
}
