import useSWR from 'swr';

interface UseResourceListOptions {
  clusterId: string | null;
  namespace: string;
  resourceType: string;
  refreshInterval?: number;
  enabled?: boolean;
}

export function useResourceList({
  clusterId,
  namespace,
  resourceType,
  refreshInterval = 15000,
  enabled = true,
}: UseResourceListOptions) {
  const key =
    enabled && clusterId
      ? `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}`
      : null;

  return useSWR(key, {
    refreshInterval,
  });
}
