import useSWR from 'swr';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ClusterInfo } from '@/types/cluster';
import { useNamespaceStore } from '@/stores/namespace-store';

export function useClusters() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ clusters: ClusterInfo[] }>(
    '/api/clusters',
    {
      refreshInterval: 30000,
    }
  );

  const { activeNamespaces, setActiveNamespace } = useNamespaceStore();
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  // Tracks clusters that have received their status update in the current stream
  const [checkedClusters, setCheckedClusters] = useState<Set<string>>(new Set());
  // Tracks individual clusters being refreshed
  const [refreshingClusters, setRefreshingClusters] = useState<Set<string>>(new Set());

  // Auto-set namespace from kubeconfig context when not yet configured
  useEffect(() => {
    if (!data?.clusters) return;
    for (const cluster of data.clusters) {
      if (cluster.namespace && !activeNamespaces[cluster.name]) {
        setActiveNamespace(cluster.name, cluster.namespace);
      }
    }
  }, [data?.clusters, activeNamespaces, setActiveNamespace]);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Stream health status updates — each cluster status arrives as its check completes
  const startStatusStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsCheckingStatus(true);
    setCheckedClusters(new Set());
    const es = new EventSource('/api/clusters/status');
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      const update = JSON.parse(event.data as string) as {
        done?: boolean;
        name?: string;
        status?: ClusterInfo['status'];
        error?: string | null;
      };

      if (update.done) {
        es.close();
        eventSourceRef.current = null;
        setIsCheckingStatus(false);
        return;
      }

      if (update.name) {
        setCheckedClusters((prev) => new Set(prev).add(update.name!));
        mutate(
          (current) => {
            if (!current) return current;
            return {
              clusters: current.clusters.map((c) =>
                c.name === update.name
                  ? { ...c, status: update.status ?? c.status, error: update.error ?? undefined }
                  : c
              ),
            };
          },
          { revalidate: false }
        );
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setIsCheckingStatus(false);
    };
  }, [mutate]);

  // Refresh status for a single cluster
  const refreshClusterStatus = useCallback(async (contextName: string) => {
    setRefreshingClusters((prev) => new Set(prev).add(contextName));
    try {
      const res = await fetch(`/api/clusters/status/${encodeURIComponent(contextName)}`);
      if (!res.ok) return;
      const update = await res.json() as { name: string; status: ClusterInfo['status']; error: string | null };
      mutate(
        (current) => {
          if (!current) return current;
          return {
            clusters: current.clusters.map((c) =>
              c.name === update.name
                ? { ...c, status: update.status, error: update.error ?? undefined }
                : c
            ),
          };
        },
        { revalidate: false }
      );
    } finally {
      setRefreshingClusters((prev) => {
        const next = new Set(prev);
        next.delete(contextName);
        return next;
      });
    }
  }, [mutate]);

  // Start status stream whenever SWR completes a fetch (initial load or 30s revalidation).
  // Using isValidating transition (true→false) avoids re-triggering on local mutate calls.
  const prevValidatingRef = useRef(true);
  useEffect(() => {
    const wasValidating = prevValidatingRef.current;
    prevValidatingRef.current = isValidating;

    if (wasValidating && !isValidating && data?.clusters?.length) {
      startStatusStream();
    }
  }, [isValidating, data?.clusters?.length, startStatusStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return {
    clusters: data?.clusters || [],
    error,
    isLoading,
    isCheckingStatus,
    checkedClusters,
    refreshingClusters,
    refreshClusterStatus,
    mutate,
  };
}
