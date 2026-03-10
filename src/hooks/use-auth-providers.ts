import useSWR from 'swr';
import { useSettingsStore } from '@/stores/settings-store';
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
    isLoading: !override && isLoading,
  };
}

export function useProviderLogin() {
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
    return data;
  }, []);

  return { login };
}
