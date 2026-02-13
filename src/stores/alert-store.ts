import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AlertRule, AlertEvent } from '@/types/alert';

const MAX_HISTORY = 500;

interface AlertState {
  rules: AlertRule[];
  history: AlertEvent[];
  lastTriggered: Record<string, number>;

  // CRUD for rules
  addRule: (rule: AlertRule) => void;
  updateRule: (id: string, updates: Partial<AlertRule>) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;

  // History
  addAlert: (event: AlertEvent) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearHistory: () => void;

  // Cooldown
  setLastTriggered: (ruleId: string, timestamp: number) => void;

  // Computed
  unreadCount: () => number;
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set, get) => ({
      rules: [],
      history: [],
      lastTriggered: {},

      addRule: (rule) => {
        set((state) => ({ rules: [...state.rules, rule] }));
      },

      updateRule: (id, updates) => {
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        }));
      },

      deleteRule: (id) => {
        set((state) => ({
          rules: state.rules.filter((r) => r.id !== id),
        }));
      },

      toggleRule: (id) => {
        set((state) => ({
          rules: state.rules.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r
          ),
        }));
      },

      addAlert: (event) => {
        set((state) => ({
          history: [event, ...state.history].slice(0, MAX_HISTORY),
        }));
      },

      markRead: (id) => {
        set((state) => ({
          history: state.history.map((e) =>
            e.id === id ? { ...e, read: true } : e
          ),
        }));
      },

      markAllRead: () => {
        set((state) => ({
          history: state.history.map((e) => ({ ...e, read: true })),
        }));
      },

      clearHistory: () => {
        set({ history: [] });
      },

      setLastTriggered: (ruleId, timestamp) => {
        set((state) => ({
          lastTriggered: { ...state.lastTriggered, [ruleId]: timestamp },
        }));
      },

      unreadCount: () => {
        return get().history.filter((e) => !e.read).length;
      },
    }),
    {
      name: 'kubeops-alerts',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
