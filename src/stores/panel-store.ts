import { create } from 'zustand';

export interface PanelTab {
  id: string;
  type: 'exec' | 'logs';
  title: string;
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
}

export interface PanelTabTarget {
  type: PanelTab['type'];
  clusterId: string;
  namespace: string;
  podName: string;
  container: string;
}

/**
 * Identity of a panel tab. Cluster and namespace are part of the key: two pods
 * can share a name across clusters or namespaces, and reusing a tab for them
 * would show one cluster's output under another cluster's label.
 */
export function buildPanelTabId(target: PanelTabTarget): string {
  return [target.type, target.clusterId, target.namespace, target.podName, target.container]
    .map(encodeURIComponent)
    .join('|');
}

/**
 * Callers describe *what* they want to open; the id is always derived so it can
 * never drift from the tab's real identity.
 */
export type PanelTabInput = Omit<PanelTab, 'id'> & { id?: string };

interface PanelState {
  open: boolean;
  height: number;
  tabs: PanelTab[];
  activeTabId: string | null;
  setOpen: (open: boolean) => void;
  setHeight: (height: number) => void;
  addTab: (tab: PanelTabInput) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Pick<PanelTab, 'podName' | 'container' | 'title'>>) => void;
  toggle: () => void;
}

export const usePanelStore = create<PanelState>()((set, get) => ({
  open: false,
  height: 320,
  tabs: [],
  activeTabId: null,

  setOpen: (open) => set({ open }),
  setHeight: (height) => set({ height: Math.max(150, Math.min(height, 800)) }),

  addTab: (tab) => {
    const { tabs } = get();
    const id = buildPanelTabId(tab);
    // If the same target is already open, just activate it.
    if (tabs.some((t) => t.id === id)) {
      set({ activeTabId: id, open: true });
      return;
    }
    set({ tabs: [...tabs, { ...tab, id }], activeTabId: id, open: true });
  },

  removeTab: (id) => {
    const { tabs, activeTabId } = get();
    const next = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      nextActive = next[Math.min(idx, next.length - 1)]?.id || null;
    }
    set({ tabs: next, activeTabId: nextActive, open: next.length > 0 });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) => {
    const { tabs, activeTabId } = get();
    const target = tabs.find((t) => t.id === id);
    if (!target) return;

    const next = { ...target, ...updates };
    // Switching pod/container changes the tab's identity, so the id has to move
    // with it — otherwise a later addTab for the same target opens a duplicate.
    const nextId = buildPanelTabId(next);
    if (nextId !== target.id && tabs.some((t) => t.id !== id && t.id === nextId)) {
      // Merging into an existing tab: drop this one and focus the other.
      set({
        tabs: tabs.filter((t) => t.id !== id),
        activeTabId: activeTabId === id ? nextId : activeTabId,
      });
      return;
    }

    set({
      tabs: tabs.map((t) => (t.id === id ? { ...next, id: nextId } : t)),
      activeTabId: activeTabId === id ? nextId : activeTabId,
    });
  },

  toggle: () => set((s) => ({ open: !s.open })),
}));
