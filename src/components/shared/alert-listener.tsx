'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useWatchContext } from '@/providers/watch-provider';
import { useAlertStore } from '@/stores/alert-store';
import { evaluateRules } from '@/lib/alert-evaluator';
import { selectActiveRules } from '@/lib/alert-scope';
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
 * Headless component that evaluates alert rules against the active cluster's
 * Watch stream.
 *
 * Scope is deliberately the cluster you are viewing: it reuses the connection
 * the page already holds instead of opening a socket per rule-bearing cluster.
 * Rules for other clusters are reported as paused in Settings → Alert Rules
 * rather than silently doing nothing.
 */
export function AlertListener() {
  const params = useParams();
  const clusterId = typeof params?.clusterId === 'string' ? decodeURIComponent(params.clusterId) : null;
  const watchCtx = useWatchContext();
  const rules = useAlertStore((s) => s.rules);
  const lastTriggered = useAlertStore((s) => s.lastTriggered);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setLastTriggered = useAlertStore((s) => s.setLastTriggered);

  // Refs so the subscription callback never goes stale without resubscribing.
  const rulesRef = useRef(rules);
  const lastTriggeredRef = useRef(lastTriggered);
  const clusterIdRef = useRef(clusterId);
  useEffect(() => { rulesRef.current = rules; });
  useEffect(() => { lastTriggeredRef.current = lastTriggered; });
  useEffect(() => { clusterIdRef.current = clusterId; });

  const handleWatchEvent = useCallback(
    (event: WatchEvent) => {
      if (event.type === 'BOOKMARK' || event.type === 'ERROR') return;

      const activeRules = selectActiveRules(rulesRef.current, clusterIdRef.current);
      if (activeRules.length === 0) return;

      const alerts = evaluateRules(activeRules, event, lastTriggeredRef.current);

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
    [addAlert, setLastTriggered],
  );

  // `subscribe` is a stable callback, so this only re-runs when the cluster
  // changes — not on every connecting/connected transition.
  const subscribe = watchCtx?.subscribe;

  useEffect(() => {
    if (!subscribe) return;

    const unsubscribers = WATCHED_RESOURCE_TYPES.map((rt) =>
      subscribe(rt, undefined, handleWatchEvent),
    );
    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, [subscribe, handleWatchEvent]);

  return null;
}
