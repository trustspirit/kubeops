import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface WatchedPod {
  clusterId: string;
  namespace: string;
  name: string;
}

function podKey(pod: WatchedPod) {
  return `${pod.clusterId}/${pod.namespace}/${pod.name}`;
}

interface PodWatcherState {
  watchedPods: WatchedPod[];
  restartSnapshots: Record<string, number>;
  notificationsEnabled: boolean;
  addWatch: (pod: WatchedPod) => void;
  removeWatch: (pod: WatchedPod) => void;
  isWatched: (pod: WatchedPod) => boolean;
  updateSnapshot: (pod: WatchedPod, restartCount: number) => void;
  getSnapshot: (pod: WatchedPod) => number | undefined;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const usePodWatcherStore = create<PodWatcherState>()(
  persist(
    (set, get) => ({
      watchedPods: [],
      restartSnapshots: {},
      notificationsEnabled: true,
      addWatch: (pod) => {
        const key = podKey(pod);
        const { watchedPods } = get();
        if (watchedPods.some((p) => podKey(p) === key)) return;
        set({ watchedPods: [...watchedPods, pod] });
      },
      removeWatch: (pod) => {
        const key = podKey(pod);
        const { watchedPods, restartSnapshots } = get();
        const { [key]: _removed, ...rest } = restartSnapshots;
        void _removed;
        set({
          watchedPods: watchedPods.filter((p) => podKey(p) !== key),
          restartSnapshots: rest,
        });
      },
      isWatched: (pod) => {
        const key = podKey(pod);
        return get().watchedPods.some((p) => podKey(p) === key);
      },
      updateSnapshot: (pod, restartCount) => {
        const key = podKey(pod);
        set((state) => ({
          restartSnapshots: { ...state.restartSnapshots, [key]: restartCount },
        }));
      },
      getSnapshot: (pod) => {
        const key = podKey(pod);
        return get().restartSnapshots[key];
      },
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
    }),
    {
      name: 'kubeops-pod-watcher',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
