'use client';

import { createContext, useContext, type ReactNode } from 'react';
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

  return (
    <WatchContext.Provider value={{ subscribe, connectionState }}>
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
