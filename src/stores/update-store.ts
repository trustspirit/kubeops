import { create } from 'zustand';
import {
  initialUpdateState,
  reduceUpdateState,
  type UpdateAction,
  type UpdateState,
} from '@/lib/update-state';

interface UpdateStoreState extends UpdateState {
  appVersion: string | null;
  dispatch: (action: UpdateAction) => void;
  setAppVersion: (version: string | null) => void;
}

/**
 * Auto-update state lives outside any component: the header remounts on every
 * cluster switch, and per-instance state forgot a finished download (the main
 * process does not re-send "downloaded"), hiding the Restart button.
 */
export const useUpdateStore = create<UpdateStoreState>()((set) => ({
  ...initialUpdateState,
  appVersion: null,
  dispatch: (action) => set((state) => {
    const { phase, version, percent, errorMessage, installStage } = state;
    return reduceUpdateState({ phase, version, percent, errorMessage, installStage }, action);
  }),
  setAppVersion: (appVersion) => set({ appVersion }),
}));

let bridgeStarted = false;
let installPromise: Promise<void> | null = null;

/**
 * Subscribes to the Electron updater once for the app's lifetime, so status
 * pushes that arrive while no header is mounted are not lost.
 */
export function ensureUpdateBridge(): void {
  if (bridgeStarted || typeof window === 'undefined') return;
  const api = window.electronUpdater;
  if (!api) return;
  bridgeStarted = true;
  const { dispatch, setAppVersion } = useUpdateStore.getState();
  api.getAppVersion().then(setAppVersion).catch(() => {});
  api.onUpdateStatus((status) => dispatch({ type: 'status-received', status }));
}

/** At most one install at a time, across every mounted header. */
export function runInstallOnce(start: () => Promise<void>): Promise<void> | null {
  if (installPromise) return null;
  const promise = start().finally(() => {
    if (installPromise === promise) installPromise = null;
  });
  installPromise = promise;
  return promise;
}
