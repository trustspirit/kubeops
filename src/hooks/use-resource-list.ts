import { useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { useWatchContext } from '@/providers/watch-provider';
import type { WatchEvent } from '@/types/watch';
import type { KubeResource, KubeList } from '@/types/resource';

interface UseResourceListOptions {
  clusterId: string | null;
  namespace: string;
  resourceType: string;
  refreshInterval?: number;
  enabled?: boolean;
}

// Default polling interval when Watch is not connected
const DEFAULT_POLL_INTERVAL = 15000;
// Reduced polling interval when Watch is connected (fallback safety)
const WATCH_POLL_INTERVAL = 60000;

export function useResourceList({
  clusterId,
  namespace,
  resourceType,
  refreshInterval,
  enabled = true,
}: UseResourceListOptions) {
  const watchCtx = useWatchContext();
  const isWatchConnected = watchCtx?.connectionState === 'connected';

  // Determine refresh interval:
  // - If explicitly provided, use it
  // - If Watch is connected, use longer interval (reduced polling)
  // - Otherwise use default 15s polling
  const effectiveRefreshInterval =
    refreshInterval !== undefined
      ? refreshInterval
      : isWatchConnected
        ? WATCH_POLL_INTERVAL
        : DEFAULT_POLL_INTERVAL;

  const key =
    enabled && clusterId
      ? `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}`
      : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, {
    refreshInterval: effectiveRefreshInterval,
  });

  // Stable ref for mutate so we can use it in the watch callback without re-subscribing
  const mutateRef = useRef(mutate);
  useEffect(() => { mutateRef.current = mutate; });

  // Stable ref for current data
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; });

  const handleWatchEvent = useCallback((event: WatchEvent) => {
    if (event.type === 'ERROR' || event.type === 'BOOKMARK') return;

    const currentData = dataRef.current;
    if (!currentData?.items) return;

    const obj = event.object;
    if (!obj?.metadata?.uid) return;

    const uid = obj.metadata.uid;

    mutateRef.current((prev: KubeList | undefined) => {
      if (!prev?.items) return prev;

      switch (event.type) {
        case 'ADDED': {
          // Only add if not already present
          const exists = prev.items.some((item: KubeResource) => item.metadata?.uid === uid);
          if (exists) {
            // Treat as modification if already present
            return {
              ...prev,
              items: prev.items.map((item: KubeResource) =>
                item.metadata?.uid === uid ? (obj as KubeResource) : item
              ),
            };
          }
          return {
            ...prev,
            items: [...prev.items, obj as KubeResource],
          };
        }
        case 'MODIFIED': {
          return {
            ...prev,
            items: prev.items.map((item: KubeResource) =>
              item.metadata?.uid === uid ? (obj as KubeResource) : item
            ),
          };
        }
        case 'DELETED': {
          return {
            ...prev,
            items: prev.items.filter((item: KubeResource) => item.metadata?.uid !== uid),
          };
        }
        default:
          return prev;
      }
    }, { revalidate: false });
  }, []);

  // Subscribe to Watch events after SWR data loads.
  // We use `isLoading` as a proxy for whether initial data has loaded: once isLoading
  // transitions to false, initial data is available. This avoids using `data` directly
  // as a dependency, which would tear down/recreate the subscription on every data update.
  useEffect(() => {
    if (!watchCtx) return;
    if (isLoading) return; // Wait for initial data before subscribing
    if (!enabled || !clusterId) return;

    const unsubscribe = watchCtx.subscribe(resourceType, namespace, handleWatchEvent);

    return () => {
      unsubscribe();
    };
  }, [watchCtx, isLoading, enabled, clusterId, resourceType, namespace, handleWatchEvent]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}
