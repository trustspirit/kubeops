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
      onRehydrateStorage: () => {
        return (state) => {
          if (!state) return;
          // Migrate legacy tsh settings into authProviderConfigs
          const { tshProxyUrl, tshAuthType, authProviderConfigs } = state;
          if (tshProxyUrl && !authProviderConfigs['tsh']?.proxyUrl) {
            const legacyConfig: Record<string, string> = { proxyUrl: tshProxyUrl };
            if (tshAuthType) legacyConfig.authType = tshAuthType;
            state.setAuthProviderConfig('tsh', {
              ...legacyConfig,
              ...authProviderConfigs['tsh'],
            });
          }
          // Migrate renamed Teleport GitHub connector
          // Read from store (not stale `state`) to pick up any config just written above.
          const tshConfig = useSettingsStore.getState().authProviderConfigs['tsh'];
          if (tshConfig?.authType === 'github') {
            state.setAuthProviderConfig('tsh', {
              ...tshConfig,
              authType: 'teleport-github-connector',
            });
          }
        };
      },
    }
  )
);
