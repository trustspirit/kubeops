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
import { ColumnDef } from '@tanstack/react-table';
import { usePodRestartWatcher } from '@/hooks/use-pod-watcher';
import { ResourceActions } from '@/components/resources/resource-actions';
import { useNamespaceStore } from '@/stores/namespace-store';

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

  const { data, error, isLoading, mutate } = useResourceList({
    clusterId: decodedClusterId || null,
    namespace: clusterScoped ? '_' : (multiNs ? '_all' : namespace),
    resourceType,
  });

  const baseColumns = COLUMN_MAP[resourceType] || [];
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
    const clickableColumns: ColumnDef<any>[] = baseColumns.map((col: any) => {
      if (col.id === 'name') {
        return {
          ...col,
          cell: ({ row }: any) => {
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

    const actionsColumn: ColumnDef<any> = {
      id: 'actions',
      enableSorting: false,
      header: '',
      cell: ({ row }: any) => {
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
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  let items = data?.items || [];

  // Client-side namespace filtering for multi-namespace mode
  if (multiNs && selectedNs.length > 0) {
    const nsSet = new Set(selectedNs);
    items = items.filter((item: any) => nsSet.has(item.metadata?.namespace));
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{label}</h1>
      </div>
      <DataTable
        columns={allColumns}
        data={items}
        searchPlaceholder={`Search ${label.toLowerCase()}...`}
      />
    </div>
  );
}
