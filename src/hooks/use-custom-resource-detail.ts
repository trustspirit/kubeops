import useSWR from 'swr';

interface UseCustomResourceDetailOptions {
  clusterId: string | null;
  group: string;
  version: string;
  plural: string;
  name: string;
  namespace?: string;
  refreshInterval?: number;
  enabled?: boolean;
}

export function useCustomResourceDetail({
  clusterId,
  group,
  version,
  plural,
  name,
  namespace,
  refreshInterval = 5000,
  enabled = true,
}: UseCustomResourceDetailOptions) {
  const nsParam = namespace && namespace !== '_' && namespace !== '_all'
    ? `?namespace=${namespace}`
    : '';

  const key =
    enabled && clusterId && group && version && plural && name
      ? `/api/clusters/${encodeURIComponent(clusterId)}/crds/${group}/${version}/${plural}/${name}${nsParam}`
      : null;

  return useSWR(key, {
    refreshInterval,
  });
}
