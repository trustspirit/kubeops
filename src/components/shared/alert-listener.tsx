'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useWatchContext } from '@/providers/watch-provider';
import { useAlertStore } from '@/stores/alert-store';
import { evaluateRules } from '@/lib/alert-evaluator';
import { toast } from 'sonner';
import type { WatchEvent } from '@/types/watch';

/**
 * Headless component that listens to Watch events and evaluates alert rules.
 * Triggers Sonner toast and desktop Notification on match.
 * Mount this inside the cluster layout.
 */
export function AlertListener() {
  const watchCtx = useWatchContext();
  const rules = useAlertStore((s) => s.rules);
  const lastTriggered = useAlertStore((s) => s.lastTriggered);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setLastTriggered = useAlertStore((s) => s.setLastTriggered);

  // Use refs to avoid stale closures in the subscription callback
  const rulesRef = useRef(rules);
  const lastTriggeredRef = useRef(lastTriggered);
  useEffect(() => { rulesRef.current = rules; });
  useEffect(() => { lastTriggeredRef.current = lastTriggered; });

  const handleWatchEvent = useCallback(
    (event: WatchEvent) => {
      if (event.type === 'BOOKMARK' || event.type === 'ERROR') return;

      const enabledRules = rulesRef.current.filter((r) => r.enabled);
      if (enabledRules.length === 0) return;

      const alerts = evaluateRules(enabledRules, event, lastTriggeredRef.current);

      for (const alert of alerts) {
        addAlert(alert);
        setLastTriggered(alert.ruleId, alert.timestamp);

        // Sonner toast
        toast.warning(`Alert: ${alert.ruleName}`, {
          description: `${alert.resourceName}: ${alert.message}`,
          duration: 8000,
        });

        // Desktop notification
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
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
    [addAlert, setLastTriggered]
  );

  useEffect(() => {
    if (!watchCtx) return;

    // Subscribe to common resource types for alert evaluation
    const resourceTypes = [
      'pods',
      'deployments',
      'statefulsets',
      'daemonsets',
      'replicasets',
      'jobs',
      'events',
      'nodes',
    ];

    const unsubscribers: (() => void)[] = [];
    for (const rt of resourceTypes) {
      const unsub = watchCtx.subscribe(rt, undefined, handleWatchEvent);
      unsubscribers.push(unsub);
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [watchCtx, handleWatchEvent]);

  // Headless: renders nothing
  return null;
}
