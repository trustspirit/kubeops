'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useWatch, type WatchEventCallback } from '@/hooks/use-watch';
import { useAlertStore } from '@/stores/alert-store';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { evaluateRules, getAlertCooldownKey } from '@/lib/alert-evaluator';
import { evaluatePodRestart } from '@/lib/pod-restart-snapshot';
import { toast } from 'sonner';
import type { MonitorTarget } from '@/lib/monitor-targets';
import type { WatchEvent } from '@/types/watch';

type SubscribeFn = (
  resourceType: string,
  namespace: string | undefined,
  callback: WatchEventCallback,
) => () => void;

function notify(title: string, body: string) {
  toast.warning(title, { description: body, duration: 8000 });
  if (
    typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, { body });
    } catch {
      // Ignore notification errors
    }
  }
}

interface ClusterMonitorProps {
  target: MonitorTarget;
  subscribe: SubscribeFn;
}

/**
 * Evaluates one cluster's alert rules and watched pods against its Watch
 * stream. Given a `subscribe`, it does not care whether that stream belongs to
 * the page on screen or to a background connection.
 */
export function ClusterMonitor({ target, subscribe }: ClusterMonitorProps) {
  const { clusterId, resourceTypes } = target;

  const rules = useAlertStore((s) => s.rules);
  const lastTriggered = useAlertStore((s) => s.lastTriggered);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setLastTriggered = useAlertStore((s) => s.setLastTriggered);

  const watchedPods = usePodWatcherStore((s) => s.watchedPods);
  const podNotificationsEnabled = usePodWatcherStore((s) => s.notificationsEnabled);
  const getSnapshot = usePodWatcherStore((s) => s.getSnapshot);
  const updateSnapshot = usePodWatcherStore((s) => s.updateSnapshot);

  // Refs so a rule edit does not tear down and rebuild every subscription.
  const rulesRef = useRef(rules);
  const lastTriggeredRef = useRef(lastTriggered);
  const watchedPodsRef = useRef(watchedPods);
  const podNotificationsRef = useRef(podNotificationsEnabled);
  useEffect(() => { rulesRef.current = rules; });
  useEffect(() => { lastTriggeredRef.current = lastTriggered; });
  useEffect(() => { watchedPodsRef.current = watchedPods; });
  useEffect(() => { podNotificationsRef.current = podNotificationsEnabled; });

  const evaluateAlertRules = useCallback((event: WatchEvent) => {
    const enabled = rulesRef.current.filter((r) => r.enabled && r.clusterId === clusterId);
    if (enabled.length === 0) return;

    for (const alert of evaluateRules(enabled, event, lastTriggeredRef.current)) {
      addAlert(alert);
      setLastTriggered(getAlertCooldownKey(alert.ruleId, event.object), alert.timestamp);
      notify(`Alert: ${alert.ruleName}`, `${alert.resourceName}: ${alert.message}`);
    }
  }, [clusterId, addAlert, setLastTriggered]);

  const evaluateWatchedPod = useCallback((event: WatchEvent) => {
    if (!podNotificationsRef.current) return;

    const pod = event.object as {
      metadata?: { name?: string; namespace?: string; uid?: string };
      status?: { containerStatuses?: Array<{ restartCount?: number }> };
    } | undefined;

    const name = pod?.metadata?.name;
    const namespace = pod?.metadata?.namespace;
    if (!name || !namespace) return;

    const isWatched = watchedPodsRef.current.some(
      (w) => w.clusterId === clusterId && w.namespace === namespace && w.name === name,
    );
    if (!isWatched) return;

    const watchKey = { clusterId, namespace, name };
    const totalRestarts = (pod?.status?.containerStatuses || [])
      .reduce((sum, cs) => sum + (cs.restartCount || 0), 0);

    const evaluation = evaluatePodRestart(getSnapshot(watchKey), pod?.metadata?.uid, totalRestarts);
    if (evaluation.changed) updateSnapshot(watchKey, evaluation.next);

    if (evaluation.delta > 0) {
      const times = evaluation.delta > 1 ? 'times' : 'time';
      notify(
        'Pod Restart Detected',
        `${clusterId}/${namespace}: pod ${name} restarted ${evaluation.delta} ${times} (total: ${totalRestarts})`,
      );
    }
  }, [clusterId, getSnapshot, updateSnapshot]);

  const handleEvent = useCallback((resourceType: string) => (event: WatchEvent) => {
    if (event.type === 'BOOKMARK' || event.type === 'ERROR') return;
    evaluateAlertRules(event);
    if (resourceType === 'pods') evaluateWatchedPod(event);
  }, [evaluateAlertRules, evaluateWatchedPod]);

  // `resourceTypes` comes from a memoized target list, so this only re-runs when
  // the subscription set genuinely changes.
  const subscriptionKey = resourceTypes.join(',');
  useEffect(() => {
    const types = subscriptionKey.split(',').filter(Boolean);
    const unsubscribers = types.map((rt) => subscribe(rt, undefined, handleEvent(rt)));
    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, [subscribe, subscriptionKey, handleEvent]);

  return null;
}

/**
 * A monitor with its own Watch connection, for clusters that are not on screen.
 */
export function BackgroundClusterMonitor({ target }: { target: MonitorTarget }) {
  const { subscribe } = useWatch(target.clusterId);
  return <ClusterMonitor target={target} subscribe={subscribe} />;
}
