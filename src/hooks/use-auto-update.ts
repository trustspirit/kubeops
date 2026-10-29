'use client';

import { useEffect, useCallback } from 'react';
import { ensureUpdateBridge, runInstallOnce, useUpdateStore } from '@/stores/update-store';

export type { UpdatePhase } from '@/lib/update-state';

export function useAutoUpdate() {
  const phase = useUpdateStore((s) => s.phase);
  const version = useUpdateStore((s) => s.version);
  const percent = useUpdateStore((s) => s.percent);
  const errorMessage = useUpdateStore((s) => s.errorMessage);
  const installStage = useUpdateStore((s) => s.installStage);
  const appVersion = useUpdateStore((s) => s.appVersion);
  const dispatch = useUpdateStore((s) => s.dispatch);

  const isAvailable = typeof window !== 'undefined' && !!window.electronUpdater;

  // One app-lifetime subscription, shared by every instance of this hook.
  useEffect(() => { ensureUpdateBridge(); }, []);

  useEffect(() => {
    if (phase !== 'not-available') return;
    const timer = setTimeout(() => {
      // Another instance (or a new check) may have moved on already.
      if (useUpdateStore.getState().phase === 'not-available') dispatch({ type: 'dismissed' });
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase, dispatch]);

  // checkForUpdates uses IPC return value as primary, event listener as fallback
  const checkForUpdates = useCallback(() => {
    const api = window.electronUpdater;
    if (!api) return;
    dispatch({ type: 'check-requested' });
    api.checkForUpdates()
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
  }, [dispatch]);

  const downloadUpdate = useCallback(() => {
    const api = window.electronUpdater;
    if (!api) return;
    dispatch({ type: 'download-requested' });
    api.downloadUpdate().catch((err: unknown) => {
      dispatch({
        type: 'operation-failed',
        message: err instanceof Error ? err.message : 'Download failed',
      });
    });
  }, [dispatch]);

  const quitAndInstall = useCallback(async () => {
    const api = window.electronUpdater;
    if (!api) return;
    const promise = runInstallOnce(() => {
      dispatch({ type: 'install-requested' });
      return api.quitAndInstall();
    });
    if (!promise) return;
    try {
      await promise;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      dispatch({
        type: 'operation-failed',
        message: `Install failed: ${message}`,
      });
    }
  }, [dispatch]);

  const dismiss = useCallback(() => {
    dispatch({ type: 'dismissed' });
  }, [dispatch]);

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
