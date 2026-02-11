import useSWR from 'swr';

interface UseResourceDetailOptions {
  clusterId: string | null;
  namespace: string;
  resourceType: string;
  name: string;
  refreshInterval?: number;
  enabled?: boolean;
}

export function useResourceDetail({
  clusterId,
  namespace,
  resourceType,
  name,
  refreshInterval = 5000,
  enabled = true,
}: UseResourceDetailOptions) {
  const key =
    enabled && clusterId
      ? `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}/${name}`
      : null;

  return useSWR(key, {
    refreshInterval,
  });
}
