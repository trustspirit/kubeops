type LoginResponse = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  authenticated?: boolean;
  user?: string;
  expiresAt?: string;
};

export interface ProviderLoginOperation {
  providerId: string;
  scope: 'provider' | 'cluster';
  clusterId?: string;
  startedAt: number;
}

interface ProviderLoginRequestOptions {
  clusterId?: string;
}

const inFlight = new Map<string, Promise<LoginResponse>>();
const activeOperations = new Map<string, ProviderLoginOperation>();
const operationListeners = new Set<() => void>();
let operationSnapshot: ProviderLoginOperation[] = [];

function requestKey(providerId: string, config: Record<string, string>): string {
  const normalized = Object.entries(config).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([providerId, normalized]);
}

function publishOperations(): void {
  operationSnapshot = Array.from(activeOperations.values());
  for (const listener of operationListeners) listener();
}

export function getProviderLoginOperations(): ProviderLoginOperation[] {
  return operationSnapshot;
}

export function subscribeProviderLoginOperations(listener: () => void): () => void {
  operationListeners.add(listener);
  return () => operationListeners.delete(listener);
}

export function clearProviderLoginRequests(): void {
  inFlight.clear();
  activeOperations.clear();
  publishOperations();
}

export function requestProviderLogin(
  providerId: string,
  config: Record<string, string>,
  options: ProviderLoginRequestOptions = {},
): Promise<LoginResponse> {
  const key = requestKey(providerId, config);
  const current = inFlight.get(key);
  if (current) return current;

  const isClusterLogin = config.action === 'kube-login';
  const operation: ProviderLoginOperation = {
    providerId,
    scope: isClusterLogin ? 'cluster' : 'provider',
    startedAt: Date.now(),
  };
  if (isClusterLogin) operation.clusterId = options.clusterId || config.cluster;
  activeOperations.set(key, operation);
  publishOperations();

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
    activeOperations.delete(key);
    publishOperations();
  });

  inFlight.set(key, request);
  return request;
}
