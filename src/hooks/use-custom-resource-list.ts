import useSWR from 'swr';

interface UseCustomResourceListOptions {
  clusterId: string | null;
  group: string;
  version: string;
  plural: string;
  namespace?: string;
  refreshInterval?: number;
  enabled?: boolean;
}

export function useCustomResourceList({
  clusterId,
  group,
  version,
  plural,
  namespace,
  refreshInterval = 5000,
  enabled = true,
}: UseCustomResourceListOptions) {
  const nsParam = namespace && namespace !== '_' && namespace !== '_all'
    ? `?namespace=${namespace}`
    : '';

  const key =
    enabled && clusterId && group && version && plural
      ? `/api/clusters/${encodeURIComponent(clusterId)}/crds/${group}/${version}/${plural}${nsParam}`
      : null;

  return useSWR(key, {
    refreshInterval,
  });
}
