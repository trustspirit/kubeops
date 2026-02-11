'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useResourceList } from '@/hooks/use-resource-list';
import { DataTable } from '@/components/shared/data-table';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { COLUMN_MAP } from './resource-columns';
import { RESOURCE_LABELS } from '@/lib/constants';
import { ColumnDef } from '@tanstack/react-table';
import { usePodRestartWatcher } from '@/hooks/use-pod-watcher';

interface ResourceListPageProps {
  resourceType: string;
  clusterScoped?: boolean;
}

export function ResourceListPage({ resourceType, clusterScoped }: ResourceListPageProps) {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = (params.namespace as string) || '_';

  const { data, error, isLoading, mutate } = useResourceList({
    clusterId: clusterId ? decodeURIComponent(clusterId) : null,
    namespace: clusterScoped ? '_' : namespace,
    resourceType,
  });

  const columns = COLUMN_MAP[resourceType] || [];
  const label = RESOURCE_LABELS[resourceType] || resourceType;

  // Watch for pod restarts when viewing pods list
  usePodRestartWatcher(
    decodeURIComponent(clusterId),
    resourceType === 'pods' ? data?.items : undefined
  );

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  const items = data?.items || [];

  // Make name column clickable - use resource's own namespace for detail link
  const clickableColumns: ColumnDef<any>[] = columns.map((col: any) => {
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

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{label}</h1>
      </div>
      <DataTable
        columns={clickableColumns}
        data={items}
        searchPlaceholder={`Search ${label.toLowerCase()}...`}
      />
    </div>
  );
}
