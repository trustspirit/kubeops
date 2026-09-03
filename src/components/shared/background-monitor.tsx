'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAlertStore } from '@/stores/alert-store';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { getBackgroundTargets, getMonitorTargets } from '@/lib/monitor-targets';
import { BackgroundClusterMonitor } from './cluster-monitor';

/**
 * Keeps explicitly requested monitoring running for clusters that are not on
 * screen — enabled alert rules and watched pods.
 *
 * Mounted at the app root, so it survives navigation between clusters and the
 * cluster list. The cluster currently open is handled by the in-page monitor,
 * which reuses that page's existing Watch connection instead of opening a
 * second one.
 */
export function BackgroundMonitor() {
  const rules = useAlertStore((s) => s.rules);
  const watchedPods = usePodWatcherStore((s) => s.watchedPods);
  const params = useParams();
  const activeClusterId = typeof params?.clusterId === 'string'
    ? decodeURIComponent(params.clusterId)
    : null;

  const targets = useMemo(
    () => getBackgroundTargets(getMonitorTargets(rules, watchedPods), activeClusterId),
    [rules, watchedPods, activeClusterId],
  );

  return (
    <>
      {targets.map((target) => (
        <BackgroundClusterMonitor key={target.clusterId} target={target} />
      ))}
    </>
  );
}
