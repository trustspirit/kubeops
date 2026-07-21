type LoginResponse = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  authenticated?: boolean;
  user?: string;
  expiresAt?: string;
};

const inFlight = new Map<string, Promise<LoginResponse>>();

function requestKey(providerId: string, config: Record<string, string>): string {
  const normalized = Object.entries(config).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([providerId, normalized]);
}

export function clearProviderLoginRequests(): void {
  inFlight.clear();
}

export function requestProviderLogin(
  providerId: string,
  config: Record<string, string>,
): Promise<LoginResponse> {
  const key = requestKey(providerId, config);
  const current = inFlight.get(key);
  if (current) return current;

  const request = (async () => {
    const res = await fetch(`/api/auth/${providerId}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json() as LoginResponse;
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }
    return data;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request;
}
