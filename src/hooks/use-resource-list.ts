import { useEffect, useRef, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useWatchContext } from '@/providers/watch-provider';
import { fetcher } from '@/lib/api-client';
import type { WatchEvent } from '@/types/watch';
import type { KubeList } from '@/types/resource';
import {
  applyResourceWatchEvent,
  normalizeWatchNamespace,
  shouldRevalidateAfterWatchTransition,
  type ResourceWatchConnectionState,
} from '@/lib/resource-sync';
import {
  buildResourceListUrl,
  canUseWatchConnection,
  mergeNamespaceLists,
  normalizeNamespaceSelection,
} from './resource-list-policy';

interface UseResourceListOptions {
  clusterId: string | null;
  namespace: string;
  resourceType: string;
  refreshInterval?: number;
  enabled?: boolean;
  /**
   * Fetch exactly these namespaces (each on its own request) and merge them.
   * Namespace-scoped users cannot list `_all`, so a multi-namespace selection
   * must not fall back to an all-namespaces request. Overrides `namespace`
   * when it holds more than one entry.
   */
  namespaces?: readonly string[];
}

const MULTI_NAMESPACE_KEY_PREFIX = 'multi-ns:';

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
  namespaces,
}: UseResourceListOptions) {
  const watchCtx = useWatchContext();
  // Only the page's own cluster may use its Watch connection; anything else
  // (e.g. a bottom-panel tab for another cluster) polls instead.
  const watchUsable = canUseWatchConnection(watchCtx?.clusterId, clusterId);
  const subscribe = watchUsable ? watchCtx?.subscribe : undefined;
  const connectionState = watchUsable ? (watchCtx?.connectionState ?? 'disconnected') : 'disconnected';
  const isWatchConnected = connectionState === 'connected';

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

  const selectedNamespaces = normalizeNamespaceSelection(namespaces);
  const multiNamespace = selectedNamespaces.length > 1;
  const namespacesKey = selectedNamespaces.join(',');

  const key =
    enabled && clusterId
      ? multiNamespace
        ? `${MULTI_NAMESPACE_KEY_PREFIX}${buildResourceListUrl(clusterId, namespacesKey, resourceType)}`
        : buildResourceListUrl(clusterId, namespace, resourceType)
      : null;

  const multiFetcher = useCallback(async () => {
    if (!clusterId) throw new Error('No cluster selected');
    const results = await Promise.allSettled(
      namespacesKey.split(',').map((ns) => fetcher<KubeList>(buildResourceListUrl(clusterId, ns, resourceType))),
    );
    return mergeNamespaceLists(results);
  }, [clusterId, namespacesKey, resourceType]);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const { data, error, isLoading, isValidating, mutate } = useSWR(key, {
    ...(multiNamespace ? { fetcher: multiFetcher } : {}),
    refreshInterval: effectiveRefreshInterval,
    onSuccess: () => setLastUpdatedAt(Date.now()),
  });

  // Stable ref for mutate so we can use it in the watch callback without re-subscribing
  const mutateRef = useRef(mutate);
  useEffect(() => { mutateRef.current = mutate; });

  const revalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRevalidation = useCallback(() => {
    if (revalidateTimerRef.current) return;
    revalidateTimerRef.current = setTimeout(() => {
      revalidateTimerRef.current = null;
      void mutateRef.current().catch(() => {
        // SWR exposes the error to the consuming page while preserving cached data.
      });
    }, 250);
  }, []);

  useEffect(() => () => {
    if (revalidateTimerRef.current) clearTimeout(revalidateTimerRef.current);
  }, []);

  const handleWatchEvent = useCallback((event: WatchEvent) => {
    if (event.type === 'ERROR') {
      requestRevalidation();
      return;
    }

    mutateRef.current((prev: KubeList | undefined) => {
      return applyResourceWatchEvent(prev, event);
    }, { revalidate: false });
    setLastUpdatedAt(Date.now());
  }, [requestRevalidation]);

  const previousConnectionStateRef = useRef<ResourceWatchConnectionState>(connectionState);
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    const previous = previousConnectionStateRef.current;
    if (shouldRevalidateAfterWatchTransition(previous, connectionState, hasConnectedRef.current)) {
      requestRevalidation();
    }
    if (connectionState === 'connected') hasConnectedRef.current = true;
    previousConnectionStateRef.current = connectionState;
  }, [connectionState, requestRevalidation]);

  // Subscribe to Watch events after SWR data loads.
  // We use `isLoading` as a proxy for whether initial data has loaded: once isLoading
  // transitions to false, initial data is available. This avoids using `data` directly
  // as a dependency, which would tear down/recreate the subscription on every data update.
  useEffect(() => {
    if (!subscribe) return;
    if (isLoading) return; // Wait for initial data before subscribing
    if (!enabled || !clusterId) return;

    const watchNamespaces = namespacesKey.includes(',')
      ? namespacesKey.split(',')
      : [normalizeWatchNamespace(namespace)];
    const unsubscribes = watchNamespaces.map((ns) => subscribe(resourceType, ns, handleWatchEvent));

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [subscribe, isLoading, enabled, clusterId, resourceType, namespace, namespacesKey, handleWatchEvent]);

  return {
    data,
    error,
    isLoading,
    isValidating,
    lastUpdatedAt,
    mutate,
  };
}
