'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useWatch } from '@/hooks/use-watch';
import { useAlertStore } from '@/stores/alert-store';
import { evaluateRules } from '@/lib/alert-evaluator';
import { toast } from 'sonner';
import type { WatchEvent } from '@/types/watch';

/** Resource types alert rules can match against. */
const WATCHED_RESOURCE_TYPES = [
  'pods',
  'deployments',
  'statefulsets',
  'daemonsets',
  'replicasets',
  'jobs',
  'events',
  'nodes',
] as const;

/**
 * Evaluates a single cluster's enabled alert rules against its Watch stream.
 *
 * One of these is mounted per cluster that has rules, independent of which page
 * is open. Previously the listener lived in the cluster route layout and only
 * evaluated rules for the cluster being viewed, so navigating away — or just
 * sitting on the cluster list — silently stopped every alert.
 */
function ClusterAlertWatcher({ clusterId }: { clusterId: string }) {
  const { subscribe } = useWatch(clusterId);
  const rules = useAlertStore((s) => s.rules);
  const lastTriggered = useAlertStore((s) => s.lastTriggered);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setLastTriggered = useAlertStore((s) => s.setLastTriggered);

  // Refs so the subscription callback never goes stale without resubscribing.
  const rulesRef = useRef(rules);
  const lastTriggeredRef = useRef(lastTriggered);
  useEffect(() => { rulesRef.current = rules; });
  useEffect(() => { lastTriggeredRef.current = lastTriggered; });

  const handleWatchEvent = useCallback(
    (event: WatchEvent) => {
      if (event.type === 'BOOKMARK' || event.type === 'ERROR') return;

      const enabledRules = rulesRef.current.filter(
        (r) => r.enabled && r.clusterId === clusterId,
      );
      if (enabledRules.length === 0) return;

      const alerts = evaluateRules(enabledRules, event, lastTriggeredRef.current);

      for (const alert of alerts) {
        addAlert(alert);
        setLastTriggered(alert.ruleId, alert.timestamp);

        toast.warning(`Alert: ${alert.ruleName}`, {
          description: `${alert.resourceName}: ${alert.message}`,
          duration: 8000,
        });

        if (
          typeof window !== 'undefined'
          && 'Notification' in window
          && Notification.permission === 'granted'
        ) {
          try {
            new Notification(`KubeOps Alert: ${alert.ruleName}`, {
              body: `${alert.resourceName}: ${alert.message}`,
              icon: '/favicon.ico',
            });
          } catch {
            // Ignore notification errors
          }
        }
      }
    },
    [addAlert, setLastTriggered, clusterId],
  );

  useEffect(() => {
    const unsubscribers = WATCHED_RESOURCE_TYPES.map((rt) =>
      subscribe(rt, undefined, handleWatchEvent),
    );
    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, [subscribe, handleWatchEvent]);

  return null;
}

/**
 * Headless component that keeps alert rules running for every cluster that has
 * at least one enabled rule, regardless of the current route.
 */
export function AlertListener() {
  const rules = useAlertStore((s) => s.rules);

  const clusterIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of rules) {
      if (rule.enabled && rule.clusterId) ids.add(rule.clusterId);
    }
    return [...ids].sort();
  }, [rules]);

  return (
    <>
      {clusterIds.map((clusterId) => (
        <ClusterAlertWatcher key={clusterId} clusterId={clusterId} />
      ))}
    </>
  );
}
