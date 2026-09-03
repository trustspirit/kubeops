import type { AlertRule } from '@/types/alert';
import type { WatchedPod } from '@/stores/pod-watcher-store';

/**
 * Resource types alert rules can match against. A cluster with rules needs the
 * full set; one that only has watched pods needs pods alone.
 */
export const ALERT_RESOURCE_TYPES = [
  'pods',
  'deployments',
  'statefulsets',
  'daemonsets',
  'replicasets',
  'jobs',
  'events',
  'nodes',
] as const;

export const POD_ONLY_RESOURCE_TYPES = ['pods'] as const;

export interface MonitorTarget {
  clusterId: string;
  /** Watch subscriptions this cluster needs. */
  resourceTypes: readonly string[];
  hasRules: boolean;
  hasWatchedPods: boolean;
}

/**
 * Clusters that must be monitored, and what each needs subscribed.
 *
 * Anything the user explicitly opted into — an enabled alert rule, a watched
 * pod — has to keep reporting whether or not that cluster is on screen. Both
 * features previously only ran while you were looking at the right page: alert
 * rules needed their cluster open, and the pod restart watcher needed the Pods
 * *list* open, despite being described as a background watch.
 */
export function getMonitorTargets(
  rules: AlertRule[],
  watchedPods: WatchedPod[],
): MonitorTarget[] {
  const byCluster = new Map<string, { hasRules: boolean; hasWatchedPods: boolean }>();

  const ensure = (clusterId: string) => {
    let entry = byCluster.get(clusterId);
    if (!entry) {
      entry = { hasRules: false, hasWatchedPods: false };
      byCluster.set(clusterId, entry);
    }
    return entry;
  };

  for (const rule of rules) {
    if (!rule.enabled || !rule.clusterId) continue;
    ensure(rule.clusterId).hasRules = true;
  }

  for (const pod of watchedPods) {
    if (!pod.clusterId) continue;
    ensure(pod.clusterId).hasWatchedPods = true;
  }

  return [...byCluster.entries()]
    .map(([clusterId, flags]) => ({
      clusterId,
      // Only widen the subscription set when there is a rule that needs it —
      // watching one pod should not stream every node and event in the cluster.
      resourceTypes: flags.hasRules ? ALERT_RESOURCE_TYPES : POD_ONLY_RESOURCE_TYPES,
      ...flags,
    }))
    .sort((a, b) => a.clusterId.localeCompare(b.clusterId));
}

/**
 * Targets that need their own WebSocket.
 *
 * The active cluster is excluded: the page it is on already holds a Watch
 * connection, and the in-page monitor reuses it rather than opening a second.
 */
export function getBackgroundTargets(
  targets: MonitorTarget[],
  activeClusterId: string | null,
): MonitorTarget[] {
  return targets.filter((target) => target.clusterId !== activeClusterId);
}

/** What the active cluster's in-page monitor should subscribe to, if anything. */
export function getActiveTarget(
  targets: MonitorTarget[],
  activeClusterId: string | null,
): MonitorTarget | undefined {
  if (!activeClusterId) return undefined;
  return targets.find((target) => target.clusterId === activeClusterId);
}
