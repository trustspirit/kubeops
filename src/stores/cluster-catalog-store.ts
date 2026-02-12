import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ClusterMetadata {
  tags: string[];
  group: string;
  favorite: boolean;
}

interface ClusterCatalogState {
  metadata: Record<string, ClusterMetadata>;
  groups: string[];
  viewMode: 'list' | 'cards';
  showFavoritesOnly: boolean;

  getClusterMeta: (contextName: string) => ClusterMetadata;
  toggleFavorite: (contextName: string) => void;
  setGroup: (contextName: string, group: string) => void;
  addTag: (contextName: string, tag: string) => void;
  removeTag: (contextName: string, tag: string) => void;
  addGroup: (group: string) => void;
  removeGroup: (group: string) => void;
  setViewMode: (mode: 'list' | 'cards') => void;
  setShowFavoritesOnly: (show: boolean) => void;
}

const DEFAULT_META: ClusterMetadata = { tags: [], group: '', favorite: false };

export const useClusterCatalogStore = create<ClusterCatalogState>()(
  persist(
    (set, get) => ({
      metadata: {},
      groups: ['Production', 'Staging', 'Development'],
      viewMode: 'list',
      showFavoritesOnly: false,

      getClusterMeta: (contextName: string) => {
        return get().metadata[contextName] || DEFAULT_META;
      },

      toggleFavorite: (contextName: string) =>
        set((state) => {
          const current = state.metadata[contextName] || { ...DEFAULT_META };
          return {
            metadata: {
              ...state.metadata,
              [contextName]: { ...current, favorite: !current.favorite },
            },
          };
        }),

      setGroup: (contextName: string, group: string) =>
        set((state) => {
          const current = state.metadata[contextName] || { ...DEFAULT_META };
          return {
            metadata: {
              ...state.metadata,
              [contextName]: { ...current, group },
            },
          };
        }),

      addTag: (contextName: string, tag: string) =>
        set((state) => {
          const current = state.metadata[contextName] || { ...DEFAULT_META };
          if (current.tags.includes(tag)) return state;
          return {
            metadata: {
              ...state.metadata,
              [contextName]: { ...current, tags: [...current.tags, tag] },
            },
          };
        }),

      removeTag: (contextName: string, tag: string) =>
        set((state) => {
          const current = state.metadata[contextName] || { ...DEFAULT_META };
          return {
            metadata: {
              ...state.metadata,
              [contextName]: { ...current, tags: current.tags.filter((t) => t !== tag) },
            },
          };
        }),

      addGroup: (group: string) =>
        set((state) => {
          if (state.groups.includes(group)) return state;
          return { groups: [...state.groups, group] };
        }),

      removeGroup: (group: string) =>
        set((state) => ({
          groups: state.groups.filter((g) => g !== group),
          // Clear group from all clusters that had this group
          metadata: Object.fromEntries(
            Object.entries(state.metadata).map(([k, v]) => [
              k,
              v.group === group ? { ...v, group: '' } : v,
            ])
          ),
        })),

      setViewMode: (mode) => set({ viewMode: mode }),
      setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),
    }),
    {
      name: 'kubeops-cluster-catalog',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
