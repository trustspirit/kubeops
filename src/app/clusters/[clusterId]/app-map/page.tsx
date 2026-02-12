'use client';

import { useParams } from 'next/navigation';
import { useNamespaceStore } from '@/stores/namespace-store';
import { useResourceTree } from '@/hooks/use-resource-tree';
import { ResourceTreeView } from '@/components/shared/resource-tree';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';

export default function AppMapPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);

  const { nodes, edges, isLoading } = useResourceTree({
    clusterId: decodedClusterId,
    namespace: namespace === '_all' ? 'default' : namespace,
  });

  if (isLoading && nodes.length === 0) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      <div>
        <h1 className="text-2xl font-bold">App Map</h1>
        <p className="text-sm text-muted-foreground">
          Resource relationships in {namespace === '_all' ? 'default' : namespace} namespace
          {' · '}{nodes.length} resources
        </p>
      </div>

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
