import type { ClusterInfo } from '@/types/cluster';
import type { ContainerStatus, KubeEvent, KubeList, KubePod } from '@/types/resource';

export interface ClusterHealthData {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  podCount: number;
  runningPods: number;
  failingPods: number;
  warningEvents: number;
  /** Set when the cluster could not be summarised at all. */
  error?: string;
  /** Partial data: the counts are shown, but something is missing. */
  warning?: string;
}

const FAILING_REASONS = ['CrashLoopBackOff', 'Error', 'ImagePullBackOff', 'ErrImagePull'];

export function clusterHealthError(name: string, message: string): ClusterHealthData {
  return { name, status: 'error', podCount: 0, runningPods: 0, failingPods: 0, warningEvents: 0, error: message };
}

function reasonMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/**
 * Summarises one cluster's pod/event fetches. A failed pod fetch marks the
 * cluster as errored — reporting it as an empty list read "0 pods, all
 * healthy" for a cluster we could not see at all.
 */
export function summarizeClusterHealth(
  cluster: Pick<ClusterInfo, 'name' | 'status'>,
  podsRes: PromiseSettledResult<KubeList<KubePod>>,
  eventsRes: PromiseSettledResult<KubeList<KubeEvent>>,
  now = Date.now(),
): ClusterHealthData {
  if (podsRes.status === 'rejected') {
    return clusterHealthError(cluster.name, reasonMessage(podsRes.reason, 'Failed to list pods'));
  }

  const pods: KubePod[] = podsRes.value?.items || [];
  const events: KubeEvent[] = eventsRes.status === 'fulfilled' ? eventsRes.value?.items || [] : [];
  const oneHourAgo = now - 3600_000;

  const runningPods = pods.filter((p) => p.status?.phase === 'Running').length;
  const failingPods = pods.filter((p) => {
    const statuses: ContainerStatus[] = p.status?.containerStatuses || [];
    return statuses.some((cs) => {
      const reason = cs.state?.waiting?.reason;
      return reason != null && FAILING_REASONS.includes(reason);
    });
  }).length;
  const warningEvents = events.filter(
    (e) =>
      e.type === 'Warning' &&
      new Date(e.lastTimestamp || e.metadata?.creationTimestamp || '').getTime() > oneHourAgo,
  ).length;

  return {
    name: cluster.name,
    status: cluster.status,
    podCount: pods.length,
    runningPods,
    failingPods,
    warningEvents,
    // Events are secondary: keep the pod numbers, but say the count is unknown.
    ...(eventsRes.status === 'rejected'
      ? { warning: `Warning events unavailable: ${reasonMessage(eventsRes.reason, 'request failed')}` }
      : {}),
  };
}
