import type { UpdateStatus } from '@/types/electron';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export type InstallStage = 'preparing' | 'extracting' | 'restarting';

export function getInstallStageCopy(stage: InstallStage | null): string {
  switch (stage) {
    case 'extracting':
      return 'Installing update…';
    case 'restarting':
      return 'Restarting app…';
    case 'preparing':
    default:
      return 'Preparing update…';
  }
}

export interface UpdateState {
  phase: UpdatePhase;
  version: string | null;
  percent: number;
  errorMessage: string | null;
  installStage: InstallStage | null;
}

export const initialUpdateState: UpdateState = {
  phase: 'idle',
  version: null,
  percent: 0,
  errorMessage: null,
  installStage: null,
};

export type UpdateAction =
  | { type: 'status-received'; status: UpdateStatus }
  | { type: 'check-requested' }
  | { type: 'check-completed'; version?: string }
  | { type: 'download-requested' }
  | { type: 'install-requested' }
  | { type: 'operation-failed'; message: string }
  | { type: 'dismissed' };

export function reduceUpdateState(state: UpdateState, action: UpdateAction): UpdateState {
  if (action.type === 'check-requested') {
    return { ...state, phase: 'checking', errorMessage: null, installStage: null };
  }
  if (action.type === 'check-completed') {
    if (state.phase !== 'checking') return state;
    return {
      ...state,
      phase: 'available',
      version: action.version ?? state.version,
    };
  }
  if (action.type === 'download-requested') {
    return { ...state, phase: 'downloading', percent: 0, errorMessage: null };
  }
  if (action.type === 'install-requested') {
    return { ...state, phase: 'installing', installStage: 'preparing', errorMessage: null };
  }
  if (action.type === 'operation-failed') {
    return {
      ...state,
      phase: 'error',
      installStage: null,
      errorMessage: action.message,
    };
  }
  if (action.type === 'dismissed') {
    return { ...initialUpdateState };
  }

  const status = action.status;
  switch (status.status) {
    case 'checking':
      return { ...state, phase: 'checking', errorMessage: null };
    case 'available':
      return { ...state, phase: 'available', version: status.version ?? null };
    case 'not-available':
      return { ...state, phase: 'not-available', version: status.version ?? state.version };
    case 'downloading':
      return { ...state, phase: 'downloading', percent: status.percent ?? 0 };
    case 'downloaded':
      return {
        ...state,
        phase: 'downloaded',
        version: status.version ?? null,
        installStage: null,
      };
    case 'installing':
      return {
        ...state,
        phase: 'installing',
        installStage: status.stage ?? state.installStage ?? 'preparing',
        errorMessage: null,
      };
    case 'error':
      return {
        ...state,
        phase: 'error',
        installStage: null,
        errorMessage: status.message ?? 'Unknown error',
      };
  }
}
