import useSWR from 'swr';
import { ClusterInfo } from '@/types/cluster';
import { apiClient } from '@/lib/api-client';

export interface ClusterHealthData {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  podCount: number;
  runningPods: number;
  failingPods: number;
  warningEvents: number;
  error?: string;
}

async function fetchMultiClusterData(clusters: ClusterInfo[]): Promise<ClusterHealthData[]> {
  const connected = clusters.filter((c) => c.status === 'connected');

  const results = await Promise.allSettled(
    connected.map(async (cluster) => {
      const encodedName = encodeURIComponent(cluster.name);
      const [podsRes, eventsRes] = await Promise.allSettled([
        apiClient.get<any>(`/api/clusters/${encodedName}/resources/_all/pods`),
        apiClient.get<any>(`/api/clusters/${encodedName}/resources/_all/events`),
      ]);

      const pods = podsRes.status === 'fulfilled' ? podsRes.value?.items || [] : [];
      const events = eventsRes.status === 'fulfilled' ? eventsRes.value?.items || [] : [];

      const oneHourAgo = Date.now() - 3600_000;
      const runningPods = pods.filter((p: any) => p.status?.phase === 'Running').length;
      const failingPods = pods.filter((p: any) => {
        const statuses = p.status?.containerStatuses || [];
        return statuses.some((cs: any) => {
          const reason = cs.state?.waiting?.reason;
          return ['CrashLoopBackOff', 'Error', 'ImagePullBackOff', 'ErrImagePull'].includes(reason);
        });
      }).length;
      const warningEvents = events.filter(
        (e: any) =>
          e.type === 'Warning' &&
          new Date(e.lastTimestamp || e.metadata?.creationTimestamp).getTime() > oneHourAgo
      ).length;

      return {
        name: cluster.name,
        status: cluster.status,
        podCount: pods.length,
        runningPods,
        failingPods,
        warningEvents,
      } as ClusterHealthData;
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      name: connected[i].name,
      status: 'error' as const,
      podCount: 0,
      runningPods: 0,
      failingPods: 0,
      warningEvents: 0,
      error: r.reason?.message || 'Failed to fetch data',
    };
  });
}

export function useMultiClusterData(clusters: ClusterInfo[]) {
  const connectedNames = clusters
    .filter((c) => c.status === 'connected')
    .map((c) => c.name)
    .sort()
    .join(',');

  const { data, error, isLoading, mutate } = useSWR(
    connectedNames ? `multi-cluster-health:${connectedNames}` : null,
    () => fetchMultiClusterData(clusters),
    { refreshInterval: 30000 }
  );

  return {
    clusterData: data || [],
    error,
    isLoading,
    mutate,
  };
}
