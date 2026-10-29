'use client';

import { SWRConfig, type Cache, type SWRConfiguration, type State } from 'swr';
import { type ReactNode } from 'react';
import { fetcher } from '@/lib/api-client';
import { createLRUCache, ERROR_RETRY_MAX_MS, getErrorRetryDelay, isRetryableError } from './swr-policy';

/**
 * SWR stops `refreshInterval` polling while a key is in error and, with the
 * default handler, gives up after `errorRetryCount` attempts — so a page that
 * hit a VPN drop or a laptop sleep never recovered. Transient errors keep
 * retrying with capped backoff; permanent ones (401/403/404) stop.
 */
const onErrorRetry: NonNullable<SWRConfiguration['onErrorRetry']> = (
  error,
  _key,
  config,
  revalidate,
  opts,
) => {
  const { retryCount } = opts;
  if (!isRetryableError(error)) return;
  // A hook may still opt into a hard limit.
  if (typeof config.errorRetryCount === 'number' && retryCount > config.errorRetryCount) return;
  // revalidateOnFocus is off, so a hidden window must keep retrying (slowly)
  // or it would never pick up again once shown.
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const delay = hidden ? ERROR_RETRY_MAX_MS : getErrorRetryDelay(retryCount);
  setTimeout(() => { void revalidate(opts); }, delay);
};

const createCache = (): Cache => createLRUCache<State>(500);

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        onErrorRetry,
        provider: createCache,
      }}
    >
      {children}
    </SWRConfig>
  );
}
