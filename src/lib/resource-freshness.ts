export const OVERVIEW_LIVE_SWR_OPTIONS = {
  refreshInterval: 15_000,
  revalidateOnFocus: true,
} as const;

export const OVERVIEW_SLOW_SWR_OPTIONS = {
  refreshInterval: 30_000,
  revalidateOnFocus: true,
} as const;

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
