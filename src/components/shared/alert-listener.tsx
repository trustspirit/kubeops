'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useWatchContext } from '@/providers/watch-provider';
import { useAlertStore } from '@/stores/alert-store';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { getActiveTarget, getMonitorTargets } from '@/lib/monitor-targets';
import { ClusterMonitor } from './cluster-monitor';

/**
 * Monitors the cluster currently on screen, reusing the Watch connection its
 * page already holds. Every other cluster with rules or watched pods is covered
 * by `BackgroundMonitor` at the app root.
 */
export function AlertListener() {
  const params = useParams();
  const clusterId = typeof params?.clusterId === 'string'
    ? decodeURIComponent(params.clusterId)
    : null;
  const watchCtx = useWatchContext();
  const rules = useAlertStore((s) => s.rules);
  const watchedPods = usePodWatcherStore((s) => s.watchedPods);

  const target = useMemo(
    () => getActiveTarget(getMonitorTargets(rules, watchedPods), clusterId),
    [rules, watchedPods, clusterId],
  );

  if (!watchCtx || !target) return null;
  return <ClusterMonitor target={target} subscribe={watchCtx.subscribe} />;
}
