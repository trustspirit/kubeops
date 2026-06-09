import useSWR from 'swr';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStatusStore } from '@/stores/auth-status-store';
import { useCallback } from 'react';

interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
  available: boolean;
  path?: string;
  version?: string;
  configFields: { key: string; label: string; type: string; required: boolean; placeholder?: string }[];
}

interface ProviderStatus {
  authenticated: boolean;
  user?: string;
  expiresAt?: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useAuthProviders() {
  const { data, error, isLoading } = useSWR<{ providers: ProviderInfo[] }>(
    '/api/auth/providers',
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  return {
    providers: data?.providers || [],
    isLoading,
    error,
  };
}

export function useProviderStatus(providerId: string | null) {
  const { authProviderConfigs } = useSettingsStore();
  const config = providerId ? authProviderConfigs[providerId] : null;
  const queryParams = config
    ? '?' + new URLSearchParams(config).toString()
    : '';

  const { data, error, isLoading, mutate } = useSWR<ProviderStatus>(
    providerId ? `/api/auth/${providerId}/status${queryParams}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );

  return {
    status: data,
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useDetectProvider(clusterId: string | null) {
  const { clusterProviderOverrides } = useSettingsStore();
  const override = clusterId ? clusterProviderOverrides[clusterId] : null;

  const { data, isLoading } = useSWR(
    clusterId && !override ? `/api/auth/detect/${encodeURIComponent(clusterId)}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    providerId: override || data?.providerId || null,
    confidence: override ? 'override' as const : data?.confidence,
    kubeCluster: override ? undefined : data?.kubeCluster,
    isLoading: !override && isLoading,
  };
}

export function useProviderLogin() {
  const setProviderStatus = useAuthStatusStore((s) => s.setProviderStatus);

  const login = useCallback(async (
    providerId: string,
    extraConfig?: Record<string, string>
  ) => {
    // Read latest config from store to avoid stale closure
    const savedConfig = useSettingsStore.getState().authProviderConfigs[providerId] || {};
    const config = { ...savedConfig, ...extraConfig };

    const res = await fetch(`/api/auth/${providerId}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }
    // Write-through to the persisted auth-status store so that every login
    // surface (header button, ErrorDisplay, direct hook callers, …) keeps
    // the cached session info up to date across app restarts — without each
    // caller having to remember to call refreshProviderStatuses afterwards.
    // The login route enriches its response with {authenticated, user,
    // expiresAt} via the provider's getStatus() call.
    if (data.authenticated || data.user || data.expiresAt) {
      setProviderStatus(providerId, {
        authenticated: data.authenticated ?? true,
        user: data.user,
        expiresAt: data.expiresAt,
      });
    }
    return data;
  }, [setProviderStatus]);

  return { login };
}
