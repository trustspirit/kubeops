import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TableViewState {
  sorting: { id: string; desc: boolean }[];
  columnVisibility: Record<string, boolean>;
  pageSize: number;
  compact: boolean;
}

interface TableViewStore {
  views: Record<string, TableViewState>;
  getView: (key: string) => TableViewState | undefined;
  setView: (key: string, patch: Partial<TableViewState>) => void;
}

export const DEFAULT_TABLE_VIEW: TableViewState = {
  sorting: [],
  columnVisibility: {},
  pageSize: 50,
  compact: false,
};

/**
 * Per-table view preferences, keyed by table id.
 *
 * These used to be component state, so sorting by restart count and hiding
 * three columns was undone the moment you opened a detail page and came back.
 */
export const useTableViewStore = create<TableViewStore>()(
  persist(
    (set, get) => ({
      views: {},
      getView: (key) => get().views[key],
      setView: (key, patch) =>
        set((state) => ({
          views: {
            ...state.views,
            [key]: { ...DEFAULT_TABLE_VIEW, ...state.views[key], ...patch },
          },
        })),
    }),
    {
      name: 'kubeops-table-views',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
