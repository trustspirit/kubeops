import useSWR from 'swr';
import { ClusterInfo } from '@/types/cluster';

export function useClusters() {
  const { data, error, isLoading, mutate } = useSWR<{ clusters: ClusterInfo[] }>(
    '/api/clusters',
    {
      refreshInterval: 30000,
    }
  );

  return {
    clusters: data?.clusters || [],
    error,
    isLoading,
    mutate,
  };
}
