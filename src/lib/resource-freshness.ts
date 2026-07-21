export const OVERVIEW_LIVE_SWR_OPTIONS = {
  refreshInterval: 15_000,
  revalidateOnFocus: true,
} as const;

export const OVERVIEW_SLOW_SWR_OPTIONS = {
  refreshInterval: 30_000,
  revalidateOnFocus: true,
} as const;

export interface ResourceFreshness {
  label: string;
  isStale: boolean;
}

export function getResourceFreshness(
  lastUpdatedAt: number | null,
  now = Date.now(),
  staleAfterMs = 2 * 60_000,
): ResourceFreshness {
  if (lastUpdatedAt === null) {
    return { label: 'Not updated yet', isStale: false };
  }

  const ageMs = Math.max(0, now - lastUpdatedAt);
  const ageSeconds = Math.floor(ageMs / 1000);
  let ageLabel = 'just now';
  if (ageSeconds >= 60) ageLabel = `${Math.floor(ageSeconds / 60)}m ago`;
  else if (ageSeconds >= 10) ageLabel = `${ageSeconds}s ago`;

  return {
    label: `Updated ${ageLabel}`,
    isStale: ageMs >= staleAfterMs,
  };
}

export function isResourceListCacheKey(
  key: unknown,
  clusterId: string,
  resourceType: string,
): boolean {
  if (typeof key !== 'string') return false;

  const prefix = `/api/clusters/${encodeURIComponent(clusterId)}/resources/`;
  if (!key.startsWith(prefix)) return false;

  const pathParts = key.slice(prefix.length).split('/');
  return pathParts.length === 2 && pathParts[1] === resourceType;
}
