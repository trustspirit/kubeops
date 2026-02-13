'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useWatch, type WatchConnectionState, type WatchEventCallback } from '@/hooks/use-watch';

interface WatchContextValue {
  subscribe: (
    resourceType: string,
    namespace: string | undefined,
    callback: WatchEventCallback,
  ) => () => void;
  connectionState: WatchConnectionState;
}

const WatchContext = createContext<WatchContextValue | null>(null);

export function WatchProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const clusterId = params?.clusterId
    ? decodeURIComponent(params.clusterId as string)
    : null;

  const { subscribe, connectionState } = useWatch(clusterId);

  // Memoize the context value to prevent unnecessary re-renders of consumers.
  // Without this, every render of WatchProvider creates a new object reference,
  // causing all useContext(WatchContext) consumers to re-render.
  const contextValue = useMemo(
    () => ({ subscribe, connectionState }),
    [subscribe, connectionState]
  );

  return (
    <WatchContext.Provider value={contextValue}>
      {children}
    </WatchContext.Provider>
  );
}

/**
 * Access the Watch context. Returns null if WatchProvider is not mounted
 * (graceful degradation — polling continues as normal).
 */
export function useWatchContext(): WatchContextValue | null {
  return useContext(WatchContext);
}
