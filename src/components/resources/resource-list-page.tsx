'use client';

import { useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useResourceList } from '@/hooks/use-resource-list';
import { DataTable } from '@/components/shared/data-table';
import { ListSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { COLUMN_MAP } from './resource-columns';
import { RESOURCE_LABELS } from '@/lib/constants';
import { ColumnDef, CellContext } from '@tanstack/react-table';
import { usePodRestartWatcher } from '@/hooks/use-pod-watcher';
import { ResourceActions } from '@/components/resources/resource-actions';
import { useNamespaceStore } from '@/stores/namespace-store';
import type { KubeResource } from '@/types/resource';
import { getKubeResourceRowId } from '@/lib/resource-sync';
import { WatchStatusIndicator } from '@/components/shared/watch-status-indicator';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { getErrorPresentation } from '@/lib/error-presentation';

interface ResourceListPageProps {
  resourceType: string;
  clusterScoped?: boolean;
}

export function ResourceListPage({ resourceType, clusterScoped }: ResourceListPageProps) {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = (params.namespace as string) || '_';
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : '';

  const { getSelectedNamespaces, isMultiNamespace } = useNamespaceStore();
  const multiNs = !clusterScoped && isMultiNamespace(decodedClusterId);
  const selectedNs = multiNs ? getSelectedNamespaces(decodedClusterId) : [];

  const { data, error, isLoading, isValidating, lastUpdatedAt, mutate } = useResourceList({
    clusterId: decodedClusterId || null,
    namespace: clusterScoped ? '_' : (multiNs ? '_all' : namespace),
    resourceType,
  });

  const baseColumns = useMemo(
    () => (COLUMN_MAP[resourceType] || []) as ColumnDef<KubeResource>[],
    [resourceType],
  );
  const label = RESOURCE_LABELS[resourceType] || resourceType;

  // Watch for pod restarts when viewing pods list
  usePodRestartWatcher(
    decodedClusterId,
    resourceType === 'pods' ? data?.items : undefined
  );

  // Stable mutate callback to avoid re-creating columns on every render
  const handleMutate = useCallback(() => mutate(), [mutate]);

  // Memoize columns to prevent TanStack Table from re-initializing on each render
  const allColumns = useMemo(() => {
    const clickableColumns: ColumnDef<KubeResource>[] = baseColumns.map((col: ColumnDef<KubeResource>) => {
      if (col.id === 'name') {
        return {
          ...col,
          cell: ({ row }: CellContext<KubeResource, unknown>) => {
            const name = row.original.metadata?.name;
            const itemNs = row.original.metadata?.namespace || namespace;
            const basePath = clusterScoped
              ? `/clusters/${clusterId}/${resourceType}/${name}`
              : `/clusters/${clusterId}/namespaces/${itemNs}/${resourceType}/${name}`;
            return (
              <Link href={basePath} className="font-medium text-primary hover:underline">
                {name}
              </Link>
            );
          },
        };
      }
      return col;
    });

    const actionsColumn: ColumnDef<KubeResource> = {
      id: 'actions',
      enableSorting: false,
      header: '',
      cell: ({ row }: CellContext<KubeResource, unknown>) => {
        const itemName = row.original.metadata?.name;
        const itemNs = row.original.metadata?.namespace || namespace;
        return (
          <ResourceActions
            resourceType={resourceType}
            name={itemName}
            namespace={itemNs}
            clusterId={decodedClusterId}
            resource={row.original}
            onMutate={handleMutate}
          />
        );
      },
    };

    return [...clickableColumns, actionsColumn];
  }, [baseColumns, namespace, clusterId, clusterScoped, resourceType, decodedClusterId, handleMutate]);

  if (isLoading) return <ListSkeleton />;
  if (error && !data) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  let items = data?.items || [];

  // Client-side namespace filtering for multi-namespace mode
  if (multiNs && selectedNs.length > 0) {
    const nsSet = new Set(selectedNs);
    items = items.filter((item: KubeResource) => item.metadata?.namespace != null && nsSet.has(item.metadata.namespace));
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{label}</h1>
        <div className="flex flex-wrap items-center justify-end gap-3" aria-live="polite">
          <WatchStatusIndicator />
          {lastUpdatedAt && (
            <span className="text-xs text-muted-foreground" title={new Date(lastUpdatedAt).toLocaleString()}>
              Updated {new Date(lastUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => void mutate()}
            disabled={isValidating}
            aria-label={`Refresh ${label}`}
          >
            {isValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>
      {error && data && (() => {
        const feedback = getErrorPresentation(error.message, error.status);
        return (
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">Refresh failed.</span>{' '}
              <span className="text-muted-foreground">Showing the last successful data. {feedback.summary}</span>
            </span>
            <Button variant="outline" size="sm" className="h-7" onClick={() => void mutate()}>Retry</Button>
          </div>
        );
      })()}
      <DataTable
        columns={allColumns}
        data={items}
        getRowId={getKubeResourceRowId}
        searchPlaceholder={`Search ${label.toLowerCase()}...`}
      />
    </div>
  );
}
