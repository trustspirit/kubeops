import useSWR from 'swr';
import { useEffect } from 'react';
import { ClusterInfo } from '@/types/cluster';
import { useNamespaceStore } from '@/stores/namespace-store';

export function useClusters() {
  const { data, error, isLoading, mutate } = useSWR<{ clusters: ClusterInfo[] }>(
    '/api/clusters',
    {
      refreshInterval: 30000,
    }
  );

  const { activeNamespaces, setActiveNamespace } = useNamespaceStore();

  // Auto-set namespace from kubeconfig context when not yet configured
  useEffect(() => {
    if (!data?.clusters) return;
    for (const cluster of data.clusters) {
      if (cluster.namespace && !activeNamespaces[cluster.name]) {
        setActiveNamespace(cluster.name, cluster.namespace);
      }
    }
  }, [data?.clusters, activeNamespaces, setActiveNamespace]);

  return {
    clusters: data?.clusters || [],
    error,
    isLoading,
    mutate,
  };
}
