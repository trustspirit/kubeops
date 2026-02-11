'use client';

import { SWRConfig } from 'swr';
import { type ReactNode } from 'react';
import { fetcher } from '@/lib/api-client';

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
