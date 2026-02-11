'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UpdateStatus } from '@/types/electron';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export function useAutoUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  const api = typeof window !== 'undefined' ? window.electronUpdater : undefined;
  const isAvailable = !!api;
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    apiRef.current?.getAppVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!apiRef.current) return;

    const unsubscribe = apiRef.current.onUpdateStatus((status: UpdateStatus) => {
      switch (status.status) {
        case 'checking':
          setPhase('checking');
          break;
        case 'available':
          setPhase('available');
          setVersion(status.version ?? null);
          break;
        case 'not-available':
          setPhase('not-available');
          setTimeout(() => setPhase('idle'), 3000);
          break;
        case 'downloading':
          setPhase('downloading');
          setPercent(status.percent ?? 0);
          break;
        case 'downloaded':
          setPhase('downloaded');
          setVersion(status.version ?? null);
          break;
        case 'error':
          setPhase('error');
          setErrorMessage(status.message ?? 'Unknown error');
          break;
      }
    });

    return unsubscribe;
  }, []);

  const checkForUpdates = useCallback(() => {
    if (!apiRef.current) return;
    setPhase('checking');
    setErrorMessage(null);
    apiRef.current.checkForUpdates().catch(() => {});
  }, []);

  const downloadUpdate = useCallback(() => {
    if (!apiRef.current) return;
    setPercent(0);
    apiRef.current.downloadUpdate().catch(() => {});
  }, []);

  const quitAndInstall = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.quitAndInstall().catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    setPhase('idle');
    setErrorMessage(null);
  }, []);

  return {
    phase,
    version,
    percent,
    errorMessage,
    isAvailable,
    appVersion,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dismiss,
  };
}
