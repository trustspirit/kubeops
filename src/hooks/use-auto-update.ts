'use client';

import { useState, useEffect, useCallback, useRef, useReducer } from 'react';
import type { UpdateStatus } from '@/types/electron';
import {
  initialUpdateState,
  reduceUpdateState,
} from '@/lib/update-state';

export type { UpdatePhase } from '@/lib/update-state';

export function useAutoUpdate() {
  const [state, dispatch] = useReducer(reduceUpdateState, initialUpdateState);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const { phase, version, percent, errorMessage, installStage } = state;

  const api = typeof window !== 'undefined' ? window.electronUpdater : undefined;
  const isAvailable = !!api;
  const apiRef = useRef(api);
  const installPromiseRef = useRef<Promise<void> | null>(null);
  useEffect(() => { apiRef.current = api; });

  useEffect(() => {
    apiRef.current?.getAppVersion().then(setAppVersion).catch(() => {});
  }, []);

  // Event listener for push-based status updates (download progress, auto-check at startup)
  useEffect(() => {
    if (!apiRef.current) return;

    const unsubscribe = apiRef.current.onUpdateStatus((status: UpdateStatus) => {
      dispatch({ type: 'status-received', status });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (phase !== 'not-available') return;
    const timer = setTimeout(() => dispatch({ type: 'dismissed' }), 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  // checkForUpdates uses IPC return value as primary, event listener as fallback
  const checkForUpdates = useCallback(() => {
    if (!apiRef.current) return;
    dispatch({ type: 'check-requested' });
    apiRef.current.checkForUpdates()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((info: any) => {
        if (!info) {
          dispatch({ type: 'status-received', status: { status: 'not-available' } });
          return;
        }
        dispatch({ type: 'check-completed', version: info.version });
      })
      .catch((err: unknown) => {
        dispatch({
          type: 'operation-failed',
          message: err instanceof Error ? err.message : 'Update check failed',
        });
      });
  }, []);

  const downloadUpdate = useCallback(() => {
    if (!apiRef.current) return;
    dispatch({ type: 'download-requested' });
    apiRef.current.downloadUpdate().catch((err: unknown) => {
      dispatch({
        type: 'operation-failed',
        message: err instanceof Error ? err.message : 'Download failed',
      });
    });
  }, []);

  const quitAndInstall = useCallback(async () => {
    if (!apiRef.current || installPromiseRef.current) return;
    dispatch({ type: 'install-requested' });
    const promise = apiRef.current.quitAndInstall();
    installPromiseRef.current = promise;
    try {
      await promise;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      dispatch({
        type: 'operation-failed',
        message: `Install failed: ${message}`,
      });
    } finally {
      installPromiseRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    dispatch({ type: 'dismissed' });
  }, []);

  return {
    phase,
    version,
    percent,
    errorMessage,
    installStage,
    isAvailable,
    appVersion,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dismiss,
  };
}
