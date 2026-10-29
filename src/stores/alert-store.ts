import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AlertRule, AlertEvent } from '@/types/alert';

const MAX_HISTORY = 500;
/** Cooldown entries are per rule+resource, so bound them like history. */
const MAX_COOLDOWN_ENTRIES = 2_000;

function isCooldownKeyForRule(key: string, ruleId: string): boolean {
  return key === ruleId || key.startsWith(`${ruleId}:`);
}

/** Keeps the most recent entries once the map outgrows its bound. */
export function pruneCooldowns(entries: Record<string, number>, max = MAX_COOLDOWN_ENTRIES): Record<string, number> {
  const keys = Object.keys(entries);
  if (keys.length <= max) return entries;
  return Object.fromEntries(
    Object.entries(entries).sort((a, b) => b[1] - a[1]).slice(0, max),
  );
}

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

  // Cooldown, keyed by `getAlertCooldownKey(ruleId, resource)`
  setLastTriggered: (cooldownKey: string, timestamp: number) => void;

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
        set((state) => {
          // Clean up the rule's cooldown entries when it is deleted to prevent
          // unbounded growth of orphan entries in localStorage
          const remainingTriggered = Object.fromEntries(
            Object.entries(state.lastTriggered).filter(([key]) => !isCooldownKeyForRule(key, id)),
          );
          return {
            rules: state.rules.filter((r) => r.id !== id),
            lastTriggered: remainingTriggered,
          };
        });
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

      setLastTriggered: (cooldownKey, timestamp) => {
        set((state) => ({
          lastTriggered: pruneCooldowns({ ...state.lastTriggered, [cooldownKey]: timestamp }),
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
