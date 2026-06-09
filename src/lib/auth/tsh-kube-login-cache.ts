/**
 * Tracks which Teleport clusters have had `tsh kube login <cluster>` executed
 * during the current app session, so we don't re-run it on every navigation.
 *
 * Why this exists:
 * The cluster status cache marks every Teleport context as `connected` whenever
 * the proxy session (`tsh status`) is valid — it cannot tell whether a
 * per-cluster cert has been issued. Without this helper, clicking a cluster
 * whose status is `connected` could route to the cluster page before
 * `tsh kube login <cluster>` had ever run, and the page would fail to load.
 *
 * Module-level state survives React remounts. It does NOT survive a full app
 * restart — that is intentional: after a restart we re-verify per-cluster
 * credentials at least once.
 */

const TTL_MS = 10 * 60 * 1000; // 10 min — well under the typical tsh kube cert lifetime

const lastKubeLoginAt = new Map<string, number>();
type ProviderDetection = { providerId: string | null; kubeCluster?: string };
const providerDetectionCache = new Map<string, { value: ProviderDetection; at: number }>();
const detectInFlight = new Map<string, Promise<ProviderDetection | null>>();

export function markTshKubeLoginDone(contextName: string): void {
  lastKubeLoginAt.set(contextName, Date.now());
}

export function isTshKubeLoginRecent(contextName: string): boolean {
  const at = lastKubeLoginAt.get(contextName);
  if (!at) return false;
  return Date.now() - at < TTL_MS;
}

export function clearTshKubeLoginCache(contextName?: string): void {
  if (contextName) {
    lastKubeLoginAt.delete(contextName);
    providerDetectionCache.delete(contextName);
    detectInFlight.delete(contextName);
  } else {
    lastKubeLoginAt.clear();
    providerDetectionCache.clear();
    detectInFlight.clear();
  }
}

async function detectProviderForContext(contextName: string): Promise<ProviderDetection | null> {
  const cached = providerDetectionCache.get(contextName);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const inFlight = detectInFlight.get(contextName);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const detectRes = await fetch(`/api/auth/detect/${encodeURIComponent(contextName)}`);
    if (!detectRes.ok) return null;
    const detection = await detectRes.json();
    const value: ProviderDetection = {
      providerId: detection?.providerId ?? null,
      kubeCluster: detection?.kubeCluster,
    };
    providerDetectionCache.set(contextName, { value, at: Date.now() });
    return value;
  })().finally(() => {
    detectInFlight.delete(contextName);
  });

  detectInFlight.set(contextName, promise);
  return promise;
}

/**
 * Ensure a Teleport cluster has had `tsh kube login` run recently in this
 * session. Idempotent: returns early when a recent login is cached.
 *
 * Detects the provider via /api/auth/detect/<contextName>. Returns the
 * detected providerId on success (or null when detection failed). Throws
 * on login failure so callers can surface a toast.
 */
export async function ensureTshKubeLogin(contextName: string, knownProviderId?: string | null): Promise<string | null> {
  if (isTshKubeLoginRecent(contextName)) return 'tsh';

  const detection = knownProviderId && knownProviderId !== 'tsh'
    ? { providerId: knownProviderId, kubeCluster: undefined }
    : await detectProviderForContext(contextName);
  if (!detection) return null;

  const providerId: string | null = detection.providerId;
  if (providerId !== 'tsh') return providerId;

  // For Teleport: `--kube-cluster` from exec args is authoritative; fallback to context name.
  const kubeCluster: string = detection.kubeCluster || contextName;

  // Lazy import to avoid circular deps and keep this helper framework-agnostic.
  const { useSettingsStore } = await import('@/stores/settings-store');
  const savedConfig = useSettingsStore.getState().authProviderConfigs['tsh'] || {};

  const res = await fetch('/api/auth/tsh/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...savedConfig, action: 'kube-login', cluster: kubeCluster }),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `tsh kube login failed for ${kubeCluster}`);
  }
  markTshKubeLoginDone(contextName);

  // Successful per-cluster kube login is strong evidence the tsh proxy
  // session is alive — refresh the persisted store entry so the next cold
  // start's `isLikelyAuthenticated` check sees a recent good state, even
  // if the user got here without going through the header login flow.
  // The login route enriches its response with {authenticated, user, expiresAt}.
  try {
    const { useAuthStatusStore } = await import('@/stores/auth-status-store');
    if (data.authenticated || data.user || data.expiresAt) {
      useAuthStatusStore.getState().setProviderStatus('tsh', {
        authenticated: data.authenticated ?? true,
        user: data.user,
        expiresAt: data.expiresAt,
      });
    }
  } catch { /* non-fatal */ }

  return 'tsh';
}
