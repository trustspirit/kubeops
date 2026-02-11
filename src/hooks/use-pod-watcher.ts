'use client';

import { useEffect, useRef } from 'react';
import { usePodWatcherStore } from '@/stores/pod-watcher-store';
import { toast } from 'sonner';

interface PodLike {
  metadata?: {
    name?: string;
    namespace?: string;
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
  const initializedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pods || pods.length === 0) return;

    for (const pod of pods) {
      const name = pod.metadata?.name;
      const namespace = pod.metadata?.namespace;
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

      const snapshotKey = `${clusterId}/${namespace}/${name}`;
      const previousSnapshot = getSnapshot(watchKey);

      if (previousSnapshot === undefined) {
        // First time seeing this pod — set baseline, no notification
        updateSnapshot(watchKey, totalRestarts);
        initializedRef.current.add(snapshotKey);
        continue;
      }

      if (totalRestarts > previousSnapshot) {
        const delta = totalRestarts - previousSnapshot;
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

        updateSnapshot(watchKey, totalRestarts);
      }
    }
  }, [pods, clusterId, watchedPods, notificationsEnabled, getSnapshot, updateSnapshot]);
}
