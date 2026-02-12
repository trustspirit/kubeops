import { useMemo } from 'react';

interface ClusterItem {
  name: string;
  cluster: string;
  server?: string;
  status: string;
  error?: string;
}

interface ClusterMetadata {
  tags: string[];
  group: string;
  favorite: boolean;
}

interface UseClustersFilteringOptions {
  clusters: ClusterItem[];
  search: string;
  showFavoritesOnly: boolean;
  tagFilter: string | null;
  getClusterMeta: (name: string) => ClusterMetadata;
}

export function useClustersFiltering({
  clusters,
  search,
  showFavoritesOnly,
  tagFilter,
  getClusterMeta,
}: UseClustersFilteringOptions) {
  const filtered = useMemo(() => {
    let result = clusters.filter((c) => {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.server?.toLowerCase().includes(q) ?? false) ||
        c.cluster.toLowerCase().includes(q)
      );
    });

    if (showFavoritesOnly) {
      result = result.filter((c) => getClusterMeta(c.name).favorite);
    }

    if (tagFilter) {
      result = result.filter((c) => getClusterMeta(c.name).tags.includes(tagFilter));
    }

    return result;
  }, [clusters, search, showFavoritesOnly, tagFilter, getClusterMeta]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    clusters.forEach((c) => getClusterMeta(c.name).tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [clusters, getClusterMeta]);

  const grouped = useMemo(() => {
    const favorites = filtered.filter((c) => getClusterMeta(c.name).favorite);
    const groups = new Map<string, typeof filtered>();

    for (const c of filtered) {
      const meta = getClusterMeta(c.name);
      const group = meta.group || 'Ungrouped';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(c);
    }

    return { favorites, groups };
  }, [filtered, getClusterMeta]);

  const hasGroups = useMemo(
    () => Array.from(grouped.groups.keys()).some((g) => g !== 'Ungrouped'),
    [grouped.groups],
  );

  return { filtered, allTags, grouped, hasGroups };
}
