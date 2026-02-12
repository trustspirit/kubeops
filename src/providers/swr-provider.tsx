'use client';

import { SWRConfig } from 'swr';
import { type ReactNode } from 'react';
import { fetcher } from '@/lib/api-client';

function createLRUCache() {
  const map = new Map();
  const MAX_SIZE = 500;
  return {
    get: (key: string) => map.get(key),
    set: (key: string, value: any) => {
      if (map.size >= MAX_SIZE) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
      }
      map.set(key, value);
    },
    delete: (key: string) => map.delete(key),
    keys: () => map.keys(),
  };
}

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        errorRetryCount: 3,
        provider: createLRUCache,
      }}
    >
      {children}
    </SWRConfig>
  );
}
