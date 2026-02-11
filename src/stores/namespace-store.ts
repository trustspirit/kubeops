import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface NamespaceState {
  activeNamespaces: Record<string, string>;
  setActiveNamespace: (clusterId: string, namespace: string) => void;
  getActiveNamespace: (clusterId: string) => string;
}

export const useNamespaceStore = create<NamespaceState>()(
  persist(
    (set, get) => ({
      activeNamespaces: {},
      setActiveNamespace: (clusterId, namespace) =>
        set((state) => ({
          activeNamespaces: { ...state.activeNamespaces, [clusterId]: namespace },
        })),
      getActiveNamespace: (clusterId) => {
        return get().activeNamespaces[clusterId] || '_all';
      },
    }),
    {
      name: 'kubeops-namespace',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
