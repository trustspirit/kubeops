import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SettingsState {
  // Existing (kept for backwards compat with clusters page tsh UI)
  tshProxyUrl: string;
  tshAuthType: string;
  setTshProxyUrl: (url: string) => void;
  setTshAuthType: (authType: string) => void;

  // Multi-provider auth configs
  authProviderConfigs: Record<string, Record<string, string>>;
  setAuthProviderConfig: (providerId: string, config: Record<string, string>) => void;

  // Manual cluster -> provider overrides
  clusterProviderOverrides: Record<string, string>;
  setClusterProviderOverride: (clusterId: string, providerId: string) => void;
  removeClusterProviderOverride: (clusterId: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      tshProxyUrl: '',
      tshAuthType: '',
      setTshProxyUrl: (url) => set({ tshProxyUrl: url }),
      setTshAuthType: (authType) => set({ tshAuthType: authType }),

      authProviderConfigs: {},
      setAuthProviderConfig: (providerId, config) =>
        set((state) => ({
          authProviderConfigs: { ...state.authProviderConfigs, [providerId]: config },
        })),

      clusterProviderOverrides: {},
      setClusterProviderOverride: (clusterId, providerId) =>
        set((state) => ({
          clusterProviderOverrides: { ...state.clusterProviderOverrides, [clusterId]: providerId },
        })),
      removeClusterProviderOverride: (clusterId) =>
        set((state) => {
          const { [clusterId]: _, ...rest } = state.clusterProviderOverrides;
          return { clusterProviderOverrides: rest };
        }),
    }),
    {
      name: 'kubeops-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
