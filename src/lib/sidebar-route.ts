export function isSidebarRouteActive(
  pathname: string,
  resourceType: string,
  clusterId?: string,
): boolean {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (resourceType) return segments.includes(resourceType);
  if (!clusterId) return false;
  return segments.length === 2 && segments[0] === 'clusters' && segments[1] === decodeURIComponent(clusterId);
}
