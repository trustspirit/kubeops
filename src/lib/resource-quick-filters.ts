import type { KubeResource } from '@/types/resource';

/**
 * One-click filters for resource lists. Finding the handful of broken pods in
 * a few hundred used to mean typing a status into the search box.
 */
export interface QuickFilter {
  id: string;
  label: string;
  matches: (resource: KubeResource) => boolean;
}

interface ContainerStatusLike {
  ready?: boolean;
  restartCount?: number;
  state?: { waiting?: unknown; terminated?: { exitCode?: number } };
}

function containerStatuses(pod: KubeResource): ContainerStatusLike[] {
  const statuses = (pod.status as { containerStatuses?: unknown } | undefined)?.containerStatuses;
  return Array.isArray(statuses) ? (statuses as ContainerStatusLike[]) : [];
}

function podPhase(pod: KubeResource): string {
  return String((pod.status as { phase?: unknown } | undefined)?.phase ?? 'Unknown');
}

/** A pod that needs attention: failed, stuck, or running with containers that are not ready. */
export function isPodUnhealthy(pod: KubeResource): boolean {
  if (pod.metadata?.deletionTimestamp) return false;
  const phase = podPhase(pod);
  if (phase === 'Succeeded') return false;
  if (phase !== 'Running') return true;
  return containerStatuses(pod).some((cs) => !cs.ready);
}

export function isPodPending(pod: KubeResource): boolean {
  return !pod.metadata?.deletionTimestamp && podPhase(pod) === 'Pending';
}

export function podRestartCount(pod: KubeResource): number {
  return containerStatuses(pod).reduce((sum, cs) => sum + (cs.restartCount || 0), 0);
}

/** Desired vs ready replicas for a Deployment / StatefulSet / ReplicaSet. */
export function replicaReadiness(workload: KubeResource): { ready: number; desired: number } {
  const ready = Number((workload.status as { readyReplicas?: unknown } | undefined)?.readyReplicas) || 0;
  const desired = Number((workload.spec as { replicas?: unknown } | undefined)?.replicas) || 0;
  return { ready, desired };
}

function isWorkloadNotReady(workload: KubeResource): boolean {
  const { ready, desired } = replicaReadiness(workload);
  return ready < desired;
}

function isDaemonSetNotReady(ds: KubeResource): boolean {
  const status = ds.status as { desiredNumberScheduled?: unknown; numberReady?: unknown } | undefined;
  return (Number(status?.numberReady) || 0) < (Number(status?.desiredNumberScheduled) || 0);
}

const POD_FILTERS: QuickFilter[] = [
  { id: 'unhealthy', label: 'Unhealthy', matches: isPodUnhealthy },
  { id: 'pending', label: 'Pending', matches: isPodPending },
  { id: 'restarts', label: 'Restarted', matches: (pod) => podRestartCount(pod) > 0 },
];

const WORKLOAD_FILTERS: QuickFilter[] = [
  { id: 'not-ready', label: 'Not ready', matches: isWorkloadNotReady },
];

const FILTERS: Record<string, QuickFilter[]> = {
  pods: POD_FILTERS,
  deployments: WORKLOAD_FILTERS,
  statefulsets: WORKLOAD_FILTERS,
  replicasets: WORKLOAD_FILTERS,
  daemonsets: [{ id: 'not-ready', label: 'Not ready', matches: isDaemonSetNotReady }],
};

const NO_FILTERS: QuickFilter[] = [];

export function getQuickFilters(resourceType: string): QuickFilter[] {
  return FILTERS[resourceType] ?? NO_FILTERS;
}
