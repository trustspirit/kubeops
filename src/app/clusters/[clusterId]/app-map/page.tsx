'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useNamespaceStore } from '@/stores/namespace-store';
import { useResourceTree } from '@/hooks/use-resource-tree';
import { ResourceTreeView } from '@/components/shared/resource-tree';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { Tag, X } from 'lucide-react';

export default function AppMapPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);
  const [appFilter, setAppFilter] = useState<string | undefined>();

  const { nodes, edges, isLoading, appLabels } = useResourceTree({
    clusterId: decodedClusterId,
    namespace: namespace === '_all' ? 'default' : namespace,
    appFilter,
  });

  if (isLoading && nodes.length === 0) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">App Map</h1>
          <p className="text-sm text-muted-foreground">
            Resource relationships in {namespace === '_all' ? 'default' : namespace} namespace
            {' · '}{nodes.length} resources
          </p>
        </div>
      </div>

      {/* App label filter chips */}
      {appLabels.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setAppFilter(undefined)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              !appFilter
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            All
          </button>
          {appLabels.map((label) => (
            <button
              key={label}
              onClick={() => setAppFilter(appFilter === label ? undefined : label)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                appFilter === label
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {label}
              {appFilter === label && <X className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}

      <ResourceTreeView
        treeNodes={nodes}
        treeEdges={edges}
        isLoading={isLoading}
        height="calc(100vh - 220px)"
        direction="LR"
        zoomOnScroll
      />
    </div>
  );
}
