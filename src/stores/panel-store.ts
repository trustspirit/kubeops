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

interface PanelState {
  open: boolean;
  height: number;
  tabs: PanelTab[];
  activeTabId: string | null;
  setOpen: (open: boolean) => void;
  setHeight: (height: number) => void;
  addTab: (tab: PanelTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
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
    // If same tab already exists, just activate it
    const existing = tabs.find(
      (t) => t.type === tab.type && t.podName === tab.podName && t.container === tab.container
    );
    if (existing) {
      set({ activeTabId: existing.id, open: true });
      return;
    }
    set({ tabs: [...tabs, tab], activeTabId: tab.id, open: true });
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
  toggle: () => set((s) => ({ open: !s.open })),
}));
