'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePodWatcherStore, type WatchedPod } from '@/stores/pod-watcher-store';

interface PodWatchButtonProps {
  clusterId: string;
  namespace: string;
  podName: string;
}

export function PodWatchButton({ clusterId, namespace, podName }: PodWatchButtonProps) {
  const { isWatched, addWatch, removeWatch } = usePodWatcherStore();
  const pod: WatchedPod = { clusterId, namespace, name: podName };
  const watching = isWatched(pod);

  const handleToggle = () => {
    if (watching) {
      removeWatch(pod);
    } else {
      // Request notification permission on first watch
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      addWatch(pod);
    }
  };

  return (
    <Button
      variant={watching ? 'default' : 'outline'}
      size="sm"
      onClick={handleToggle}
      title={watching ? 'Stop watching for restarts' : 'Watch for restarts'}
    >
      {watching ? (
        <><Eye className="h-4 w-4 mr-1" />Watching</>
      ) : (
        <><EyeOff className="h-4 w-4 mr-1" />Watch</>
      )}
    </Button>
  );
}
