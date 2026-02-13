'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomResourceList } from '@/hooks/use-custom-resource-list';
import { useCrdList, CrdItem } from '@/hooks/use-crd-list';
import { useNamespaceStore } from '@/stores/namespace-store';
import { DataTable } from '@/components/shared/data-table';
import { ListSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { AgeDisplay } from '@/components/shared/age-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ColumnDef, CellContext } from '@tanstack/react-table';
import type { KubeResource } from '@/types/resource';

function resolveJsonPath(obj: KubeResource, jsonPath: string): unknown {
  // Convert JSONPath like ".spec.replicas" to object access
  const path = jsonPath.replace(/^\.\/?/, '').split('.');
  let current: unknown = obj;
  for (const key of path) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function buildColumns(crd: CrdItem | undefined, isNamespaced: boolean, clusterId: string, group: string, version: string, plural: string): ColumnDef<KubeResource>[] {
  const cols: ColumnDef<KubeResource>[] = [];

  // Name column (clickable)
  cols.push({
    id: 'name',
    header: 'Name',
    accessorFn: (row: KubeResource) => row.metadata?.name,
    cell: ({ row }: CellContext<KubeResource, unknown>) => {
      const name = row.original.metadata?.name;
      const ns = row.original.metadata?.namespace;
      const href = ns
        ? `/clusters/${clusterId}/custom-resources/${group}/${version}/${plural}/${name}?ns=${ns}`
        : `/clusters/${clusterId}/custom-resources/${group}/${version}/${plural}/${name}`;
      return (
        <Link href={href} className="font-medium text-primary hover:underline">
          {name}
        </Link>
      );
    },
  });

  // Namespace column for namespaced CRDs
  if (isNamespaced) {
    cols.push({
      id: 'namespace',
      header: 'Namespace',
      accessorFn: (row: KubeResource) => row.metadata?.namespace,
      cell: ({ row }: CellContext<KubeResource, unknown>) => {
        const ns = row.original.metadata?.namespace;
        return ns ? <Badge variant="outline" className="text-xs font-mono font-normal">{ns}</Badge> : null;
      },
    });
  }

  // Dynamic columns from CRD's additionalPrinterColumns
  if (crd?.printerColumns) {
    for (const col of crd.printerColumns) {
      // Skip name and age as we handle them separately
      if (col.name.toLowerCase() === 'name' || col.name.toLowerCase() === 'age') continue;
      // Skip low-priority columns
      if (col.priority && col.priority > 0) continue;

      cols.push({
        id: `printer-${col.name}`,
        header: col.name,
        accessorFn: (row: KubeResource) => resolveJsonPath(row, col.jsonPath),
        cell: ({ getValue }: CellContext<KubeResource, unknown>) => {
          const value = getValue();
          if (value == null) return <span className="text-muted-foreground">-</span>;
          if (typeof value === 'boolean') {
            return <Badge variant={value ? 'default' : 'secondary'} className="text-xs">{String(value)}</Badge>;
          }
          return <span className="text-sm font-mono">{String(value)}</span>;
        },
      });
    }
  }

  // Age column
  cols.push({
    id: 'age',
    header: 'Age',
    accessorFn: (row: KubeResource) => row.metadata?.creationTimestamp,
    cell: ({ row }: CellContext<KubeResource, unknown>) => (
      <AgeDisplay timestamp={row.original.metadata?.creationTimestamp} />
    ),
  });

  return cols;
}

export function CrListPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const resourcePath = params.resourcePath as string[];
  const [group, version, plural] = resourcePath || [];

  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : '';
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);

  // Fetch CRD metadata to get printerColumns and scope
  const { data: crdData } = useCrdList({
    clusterId: decodedClusterId || null,
  });

  const crd = useMemo(() => {
    return crdData?.items?.find(
      (c) => c.group === group && c.plural === plural
    );
  }, [crdData, group, plural]);

  const isNamespaced = crd?.scope === 'Namespaced';
  const effectiveNamespace = isNamespaced ? namespace : undefined;

  const { data, error, isLoading, mutate } = useCustomResourceList({
    clusterId: decodedClusterId || null,
    group,
    version,
    plural,
    namespace: effectiveNamespace,
  });

  const columns = useMemo(
    () => buildColumns(crd, isNamespaced, clusterId, group, version, plural),
    [crd, isNamespaced, clusterId, group, version, plural]
  );

  if (isLoading) return <ListSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  const items = data?.items || [];
  const kindLabel = crd?.kind || plural;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/clusters/${clusterId}/custom-resources`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{kindLabel}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {group}/{version}
          </p>
        </div>
        {crd && (
          <Badge
            variant="outline"
            className="ml-2 text-xs"
          >
            {crd.scope}
          </Badge>
        )}
      </div>
      <DataTable
        columns={columns}
        data={items}
        searchPlaceholder={`Search ${kindLabel.toLowerCase()}...`}
      />
    </div>
  );
}
