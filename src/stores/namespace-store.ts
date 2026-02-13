import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface NamespaceState {
  activeNamespaces: Record<string, string>;
  selectedNamespaces: Record<string, string[]>;
  setActiveNamespace: (clusterId: string, namespace: string) => void;
  getActiveNamespace: (clusterId: string) => string;
  setSelectedNamespaces: (clusterId: string, namespaces: string[]) => void;
  getSelectedNamespaces: (clusterId: string) => string[];
  isMultiNamespace: (clusterId: string) => boolean;
}

export const useNamespaceStore = create<NamespaceState>()(
  persist(
    (set, get) => ({
      activeNamespaces: {},
      selectedNamespaces: {},
      setActiveNamespace: (clusterId, namespace) =>
        set((state) => ({
          activeNamespaces: { ...state.activeNamespaces, [clusterId]: namespace },
          // Clear multi-select when single namespace is chosen
          selectedNamespaces: { ...state.selectedNamespaces, [clusterId]: [] },
        })),
      getActiveNamespace: (clusterId) => {
        return get().activeNamespaces[clusterId] || '_all';
      },
      setSelectedNamespaces: (clusterId, namespaces) =>
        set((state) => ({
          selectedNamespaces: { ...state.selectedNamespaces, [clusterId]: namespaces },
        })),
      getSelectedNamespaces: (clusterId) => {
        return get().selectedNamespaces[clusterId] || [];
      },
      isMultiNamespace: (clusterId) => {
        const selected = get().selectedNamespaces[clusterId] || [];
        return selected.length > 1;
      },
    }),
    {
      name: 'kubeops-namespace',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
