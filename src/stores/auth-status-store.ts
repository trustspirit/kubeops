import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Cached snapshot of an auth provider's last known status.
 * Persisted across app restarts so the UI immediately reflects the
 * previously-known authenticated state instead of flashing "unauthenticated"
 * (and triggering an unwanted auto-login) while the live status check runs.
 *
 * Live state from the server still wins once the next refresh completes.
 */
export interface CachedProviderStatus {
  authenticated: boolean;
  user?: string;
  /** ISO string (Date is not JSON-safe). Optional; populated for providers that expose expiry. */
  expiresAt?: string;
  /** Epoch ms when this snapshot was recorded. */
  updatedAt: number;
}

interface AuthStatusState {
  providerStatuses: Record<string, CachedProviderStatus>;
  setProviderStatus: (providerId: string, status: Omit<CachedProviderStatus, 'updatedAt'>) => void;
  setProviderStatuses: (statuses: Record<string, Omit<CachedProviderStatus, 'updatedAt'>>) => void;
  clearProviderStatus: (providerId?: string) => void;
  /**
   * True when the cached status is still within its expiry (if known) AND was
   * updated within the given freshness window. Used to skip auto-login when the
   * previous session is very likely still valid.
   */
  isLikelyAuthenticated: (providerId: string, freshnessMs?: number) => boolean;
}

const DEFAULT_FRESHNESS_MS = 12 * 60 * 60 * 1000; // 12h — tsh/aws-iam default

// Provider-specific freshness backstops. Used when the persisted entry has no
// `expiresAt` (i.e. the provider's getStatus didn't surface one). These are
// upper bounds: if the cached entry is older than this, treat it as suspect
// and let the live status check decide. Tighter than the default so we don't
// optimistically show a green check 11h after a gcloud/az token actually died.
const FRESHNESS_BY_PROVIDER: Record<string, number> = {
  tsh: 12 * 60 * 60 * 1000,
  'aws-sso': 8 * 60 * 60 * 1000,
  'aws-iam': 12 * 60 * 60 * 1000,
  gke: 55 * 60 * 1000,
  aks: 55 * 60 * 1000,
};

export const useAuthStatusStore = create<AuthStatusState>()(
  persist(
    (set, get) => ({
      providerStatuses: {},
      setProviderStatus: (providerId, status) =>
        set((state) => ({
          providerStatuses: {
            ...state.providerStatuses,
            [providerId]: { ...status, updatedAt: Date.now() },
          },
        })),
      setProviderStatuses: (statuses) =>
        set((state) => {
          const now = Date.now();
          const next: Record<string, CachedProviderStatus> = { ...state.providerStatuses };
          for (const [id, s] of Object.entries(statuses)) {
            next[id] = { ...s, updatedAt: now };
          }
          return { providerStatuses: next };
        }),
      clearProviderStatus: (providerId) =>
        set((state) => {
          if (!providerId) return { providerStatuses: {} };
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [providerId]: _removed, ...rest } = state.providerStatuses;
          return { providerStatuses: rest };
        }),
      isLikelyAuthenticated: (providerId, freshnessMs) => {
        const s = get().providerStatuses[providerId];
        if (!s || !s.authenticated) return false;
        if (s.expiresAt) {
          const expMs = Date.parse(s.expiresAt);
          if (!Number.isNaN(expMs) && expMs <= Date.now()) return false;
        }
        const window = freshnessMs ?? FRESHNESS_BY_PROVIDER[providerId] ?? DEFAULT_FRESHNESS_MS;
        return Date.now() - s.updatedAt < window;
      },
    }),
    {
      name: 'kubeops-auth-status',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
