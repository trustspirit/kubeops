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
  const [lastStatusUpdateAt, setLastStatusUpdateAt] = useState<number | null>(null);
  // Differentiates manual refresh (button click) from background auto-refresh
  const isManualRefreshRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

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
  // silent=true: background refresh — don't show loading indicators, just swap data
  const startStatusStream = useCallback((silent = false, force = false) => {
    if (eventSourceRef.current) {
      // A background refresh must not replace a stream that is still running:
      // the replaced stream never reports `done`, which left the first-load
      // spinner (and the disabled Refresh button) stuck forever.
      if (silent) return;
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!silent) {
      setIsCheckingStatus(true);
      setCheckedClusters(new Set());
    }
    const es = new EventSource(`/api/clusters/status${force ? '?force=1' : ''}`);
    eventSourceRef.current = es;

    const finish = () => {
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
      if (!silent) setIsCheckingStatus(false);
    };

    es.onmessage = (event: MessageEvent) => {
      if (eventSourceRef.current !== es) return;
      const update = JSON.parse(event.data as string) as {
        done?: boolean;
        name?: string;
        status?: ClusterInfo['status'];
        error?: string | null;
      };

      if (update.done) {
        setLastStatusUpdateAt(Date.now());
        finish();
        return;
      }

      if (update.name) {
        setLastStatusUpdateAt(Date.now());
        if (!silent) {
          setCheckedClusters((prev) => new Set(prev).add(update.name!));
        }
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
      if (eventSourceRef.current !== es) {
        es.close();
        return;
      }
      finish();
    };
  }, [mutate]);

  // Refresh status for a single cluster
  const refreshClusterStatus = useCallback(async (contextName: string) => {
    setRefreshingClusters((prev) => new Set(prev).add(contextName));
    try {
      const res = await fetch(`/api/clusters/status/${encodeURIComponent(contextName)}`);
      if (!res.ok) {
        // Update cluster status to reflect the error
        mutate(
          (current) => {
            if (!current) return current;
            return {
              clusters: current.clusters.map((c) =>
                c.name === contextName
                  ? { ...c, status: 'error' as const, error: `Status check failed (${res.status})` }
                  : c
              ),
            };
          },
          { revalidate: false }
        );
        return;
      }
      const update = await res.json() as { name: string; status: ClusterInfo['status']; error: string | null };
      setLastStatusUpdateAt(Date.now());
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
  // First load + manual refresh: show loading indicators. Background refresh: silent swap.
  const prevValidatingRef = useRef(true);
  useEffect(() => {
    const wasValidating = prevValidatingRef.current;
    prevValidatingRef.current = isValidating;

    if (wasValidating && !isValidating && data?.clusters?.length) {
      const isFirstLoad = !hasLoadedOnceRef.current;
      hasLoadedOnceRef.current = true;

      if (isFirstLoad || isManualRefreshRef.current) {
        const wasManual = isManualRefreshRef.current;
        isManualRefreshRef.current = false;
        // Only a manual refresh bypasses the server-side status cache.
        startStatusStream(false, wasManual);
      } else {
        startStatusStream(true);
      }
    }
  }, [isValidating, data?.clusters?.length, startStatusStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Manual refresh: triggers loading indicators
  const manualRefresh = useCallback(async () => {
    isManualRefreshRef.current = true;
    await mutate();
  }, [mutate]);

  return {
    clusters: data?.clusters || [],
    error,
    isLoading,
    isCheckingStatus,
    checkedClusters,
    refreshingClusters,
    lastStatusUpdateAt,
    refreshClusterStatus,
    manualRefresh,
    mutate,
  };
}
