import useSWR from 'swr';

export function useNamespaces(clusterId: string | null) {
  const key = clusterId
    ? `/api/clusters/${encodeURIComponent(clusterId)}/namespaces`
    : null;

  const { data, error, isLoading } = useSWR(key, {
    refreshInterval: 30000,
  });

  return {
    namespaces: data?.namespaces || [],
    error,
    isLoading,
  };
}
