import useSWR from 'swr';
import { useEffect, useRef } from 'react';
import { ClusterInfo } from '@/types/cluster';
import { apiClient } from '@/lib/api-client';
import { ensureTshKubeLogin } from '@/lib/auth/tsh-kube-login-cache';
import type { KubeList, KubePod, KubeEvent } from '@/types/resource';
import { clusterHealthError, summarizeClusterHealth, type ClusterHealthData } from './multi-cluster-health';

export type { ClusterHealthData } from './multi-cluster-health';

/** Status updates stream in one cluster at a time; refetch once they settle. */
const CONNECTED_SET_SETTLE_MS = 1_000;

async function fetchMultiClusterData(clusters: ClusterInfo[]): Promise<ClusterHealthData[]> {
  const connected = clusters.filter((c) => c.status === 'connected');

  const results = await Promise.allSettled(
    connected.map(async (cluster) => {
      // For Teleport clusters the parent `connected` status only reflects the
      // proxy session, not per-cluster credentials. Without this, the two
      // /api/clusters/.../resources/... fetches below would return 401 for any
      // tsh cluster whose per-cluster cert was never issued (or expired), and
      // the overview would show confusing "error" cards even though the
      // cluster list looks fine. Cached + idempotent → cheap on repeat ticks.
      try {
        await ensureTshKubeLogin(cluster.name, cluster.authProvider);
      } catch (err) {
        return clusterHealthError(cluster.name, err instanceof Error ? err.message : 'tsh kube login failed');
      }

      const encodedName = encodeURIComponent(cluster.name);
      const [podsRes, eventsRes] = await Promise.allSettled([
        apiClient.get<KubeList<KubePod>>(`/api/clusters/${encodedName}/resources/_all/pods`),
        apiClient.get<KubeList<KubeEvent>>(`/api/clusters/${encodedName}/resources/_all/events`),
      ]);
      return summarizeClusterHealth(cluster, podsRes, eventsRes);
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return clusterHealthError(connected[i].name, r.reason?.message || 'Failed to fetch data');
  });
}

export function useMultiClusterData(clusters: ClusterInfo[]) {
  // The fetcher reads the latest clusters through a ref, so the SWR key can stay
  // stable while status updates stream in. Keying on the connected set reset
  // the data (and refetched every cluster) on every single status update.
  const clustersRef = useRef(clusters);
  useEffect(() => { clustersRef.current = clusters; });

  const allNames = clusters.map((c) => c.name).sort().join(',');
  const connectedNames = clusters
    .filter((c) => c.status === 'connected')
    .map((c) => c.name)
    .sort()
    .join(',');

  const { data, error, isLoading, mutate } = useSWR(
    allNames && connectedNames ? `multi-cluster-health:${allNames}` : null,
    () => fetchMultiClusterData(clustersRef.current),
    { refreshInterval: 30000 }
  );

  // Pick up clusters that became connected (or dropped) without waiting for the
  // next 30s tick, once the status stream has settled.
  const lastFetchedConnectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connectedNames) return;
    if (lastFetchedConnectedRef.current === null) {
      lastFetchedConnectedRef.current = connectedNames;
      return;
    }
    if (lastFetchedConnectedRef.current === connectedNames) return;
    const timer = setTimeout(() => {
      lastFetchedConnectedRef.current = connectedNames;
      void mutate();
    }, CONNECTED_SET_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [connectedNames, mutate]);

  return {
    clusterData: data || [],
    error,
    isLoading,
    mutate,
  };
}
