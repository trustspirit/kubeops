import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ClusterInfo } from '@/types/cluster';

interface ClusterState {
  activeClusterId: string | null;
  clusters: ClusterInfo[];
  setActiveCluster: (id: string | null) => void;
  setClusters: (clusters: ClusterInfo[]) => void;
  updateClusterStatus: (name: string, status: ClusterInfo['status'], error?: string) => void;
}

export const useClusterStore = create<ClusterState>()(
  persist(
    (set) => ({
      activeClusterId: null,
      clusters: [],
      setActiveCluster: (id) => set({ activeClusterId: id }),
      setClusters: (clusters) => set({ clusters }),
      updateClusterStatus: (name, status, error) =>
        set((state) => ({
          clusters: state.clusters.map((c) =>
            c.name === name ? { ...c, status, error } : c
          ),
        })),
    }),
    {
      name: 'kubeops-cluster',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
