import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SettingsState {
  tshProxyUrl: string;
  tshAuthType: string;
  setTshProxyUrl: (url: string) => void;
  setTshAuthType: (authType: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      tshProxyUrl: '',
      tshAuthType: '',
      setTshProxyUrl: (url) => set({ tshProxyUrl: url }),
      setTshAuthType: (authType) => set({ tshAuthType: authType }),
    }),
    {
      name: 'kubeops-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
