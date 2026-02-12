'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCrdList, CrdItem } from '@/hooks/use-crd-list';
import { ListSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown, ChevronRight, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrdGroup {
  group: string;
  crds: CrdItem[];
}

export function CrdBrowser() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data, error, isLoading, mutate } = useCrdList({
    clusterId: clusterId ? decodeURIComponent(clusterId) : null,
  });

  // Group CRDs by API group
  const groups = useMemo<CrdGroup[]>(() => {
    if (!data?.items) return [];
    const groupMap = new Map<string, CrdItem[]>();
    for (const crd of data.items) {
      const existing = groupMap.get(crd.group) || [];
      existing.push(crd);
      groupMap.set(crd.group, existing);
    }
    return Array.from(groupMap.entries())
      .map(([group, crds]) => ({
        group,
        crds: crds.sort((a, b) => a.kind.localeCompare(b.kind)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [data]);

  // Filter by search term
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        crds: g.crds.filter(
          (crd) =>
            crd.kind.toLowerCase().includes(q) ||
            crd.group.toLowerCase().includes(q) ||
            crd.plural.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.crds.length > 0);
  }, [groups, search]);

  // Auto-expand groups when searching
  const effectiveExpanded = useMemo(() => {
    if (search.trim()) {
      return new Set(filteredGroups.map((g) => g.group));
    }
    return expandedGroups;
  }, [search, filteredGroups, expandedGroups]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const handleCrdClick = (crd: CrdItem) => {
    router.push(
      `/clusters/${clusterId}/custom-resources/${crd.group}/${crd.version}/${crd.plural}`
    );
  };

  const totalCrds = data?.items?.length || 0;

  if (isLoading) return <ListSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Custom Resources</h1>
        <span className="text-sm text-muted-foreground">{totalCrds} CRDs</span>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by kind or API group..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
          <Puzzle className="h-12 w-12" />
          <p className="text-sm">
            {search ? 'No CRDs matching your search.' : 'No Custom Resource Definitions found.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredGroups.map((group) => {
            const isExpanded = effectiveExpanded.has(group.group);
            return (
              <div key={group.group} className="rounded-md border">
                <button
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.group)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-mono text-sm">{group.group}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {group.crds.length}
                  </Badge>
                </button>
                {isExpanded && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Kind</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Version</th>
                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Scope</th>
                          <th className="px-4 py-2 text-right font-medium text-muted-foreground">Plural</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.crds.map((crd) => (
                          <tr
                            key={crd.name}
                            className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleCrdClick(crd)}
                          >
                            <td className="px-4 py-2">
                              <span className="font-medium text-primary hover:underline">
                                {crd.kind}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant="outline" className="text-xs font-mono font-normal">
                                {crd.version}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">
                              <Badge
                                variant={crd.scope === 'Namespaced' ? 'secondary' : 'default'}
                                className={cn(
                                  'text-xs',
                                  crd.scope === 'Cluster' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
                                )}
                              >
                                {crd.scope === 'Namespaced' ? 'NS' : 'Cluster'}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className="font-mono text-xs text-muted-foreground">
                                {crd.plural}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
