import type { KubeList } from '@/types/resource';

export function buildResourceListUrl(clusterId: string, namespace: string, resourceType: string): string {
  return `/api/clusters/${encodeURIComponent(clusterId)}/resources/${namespace}/${resourceType}`;
}

/**
 * Normalises a multi-namespace selection: de-duplicated and sorted so the SWR
 * key does not change when the user re-orders the same selection.
 */
export function normalizeNamespaceSelection(namespaces: readonly string[] | undefined): string[] {
  if (!namespaces) return [];
  return [...new Set(namespaces.filter(Boolean))].sort();
}

/**
 * Merges per-namespace list results. Namespace-scoped users cannot list across
 * all namespaces, so each selected namespace is fetched on its own; one
 * forbidden namespace should not hide the others, but if every fetch failed the
 * first error is surfaced.
 */
export function mergeNamespaceLists(results: PromiseSettledResult<KubeList>[]): KubeList {
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<KubeList> => r.status === 'fulfilled');
  if (fulfilled.length === 0) {
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw rejected?.reason ?? new Error('No namespaces selected');
  }
  const first = fulfilled[0].value;
  return {
    apiVersion: first.apiVersion,
    kind: first.kind,
    metadata: {},
    items: fulfilled.flatMap((r) => r.value.items ?? []),
  };
}

/**
 * A Watch connection belongs to exactly one cluster (the page's). A list for a
 * different cluster — e.g. a bottom-panel tab opened from another cluster —
 * must not subscribe through it, or the other cluster's events land in this
 * list's cache.
 */
export function canUseWatchConnection(watchClusterId: string | null | undefined, listClusterId: string | null): boolean {
  return Boolean(watchClusterId && listClusterId && watchClusterId === listClusterId);
}
