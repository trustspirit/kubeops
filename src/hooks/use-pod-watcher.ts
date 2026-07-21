'use client';

import { useEffect } from 'react';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { toast } from 'sonner';
import { evaluatePodRestart } from '@/lib/pod-restart-snapshot';

interface PodLike {
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
  };
  status?: {
    containerStatuses?: Array<{
      restartCount?: number;
    }>;
  };
}

export function usePodRestartWatcher(
  clusterId: string,
  pods: PodLike[] | undefined
) {
  const { watchedPods, notificationsEnabled, getSnapshot, updateSnapshot } =
    usePodWatcherStore();

  useEffect(() => {
    if (!pods || pods.length === 0) return;

    for (const pod of pods) {
      const name = pod.metadata?.name;
      const namespace = pod.metadata?.namespace;
      const uid = pod.metadata?.uid;
      if (!name || !namespace) continue;

      const watchKey = { clusterId, namespace, name };
      const isWatched = watchedPods.some(
        (w) =>
          w.clusterId === clusterId &&
          w.namespace === namespace &&
          w.name === name
      );
      if (!isWatched) continue;

      const totalRestarts = (pod.status?.containerStatuses || []).reduce(
        (sum, cs) => sum + (cs.restartCount || 0),
        0
      );

      const previousSnapshot = getSnapshot(watchKey);
      const evaluation = evaluatePodRestart(previousSnapshot, uid, totalRestarts);

      if (evaluation.changed) {
        updateSnapshot(watchKey, evaluation.next);
      }

      if (evaluation.delta > 0) {
        const delta = evaluation.delta;
        const msg = `Pod ${name} restarted ${delta} time${delta > 1 ? 's' : ''} (total: ${totalRestarts})`;

        if (notificationsEnabled) {
          toast.warning(msg, { duration: 8000 });

          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification('Pod Restart Detected', { body: msg });
          }
        }
      }
    }
  }, [pods, clusterId, watchedPods, notificationsEnabled, getSnapshot, updateSnapshot]);
}
