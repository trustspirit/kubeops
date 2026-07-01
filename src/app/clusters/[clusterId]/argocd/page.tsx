'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ColumnDef, CellContext } from '@tanstack/react-table';
import { GitBranch, Layers3 } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { ListSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { useCustomResourceList } from '@/hooks/use-custom-resource-list';
import { ArgoCDActionButtons } from '@/components/argocd/argocd-action-buttons';
import {
  ARGOCD_APPLICATIONS_PLURAL,
  ARGOCD_GROUP,
  ARGOCD_VERSION,
  getArgoCDAppHref,
  getArgoCDAppSourceSummary,
  type ArgoCDApplication,
} from '@/lib/argocd/helpers';

function normalizeStatus(status: string | undefined): string {
  return status || 'Unknown';
}

export default function ArgoCDAppsPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data, error, isLoading, mutate } = useCustomResourceList({
    clusterId: decodedClusterId,
    group: ARGOCD_GROUP,
    version: ARGOCD_VERSION,
    plural: ARGOCD_APPLICATIONS_PLURAL,
    refreshInterval: 10000,
  });

  if (isLoading) return <ListSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  const apps = (data?.items || []) as ArgoCDApplication[];

  const columns: ColumnDef<ArgoCDApplication>[] = [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => row.metadata?.name,
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => {
        const app = row.original;
        const name = app.metadata?.name;
        const namespace = app.metadata?.namespace;
        return (
          <Link
            href={getArgoCDAppHref(clusterId, name, namespace)}
            className="font-medium text-primary hover:underline"
          >
            {name}
          </Link>
        );
      },
    },
    {
      id: 'namespace',
      header: 'Namespace',
      accessorFn: (row) => row.metadata?.namespace,
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => (
        <Badge variant="outline" className="text-xs font-mono font-normal">
          {row.original.metadata?.namespace || '-'}
        </Badge>
      ),
    },
    {
      id: 'sync',
      header: 'Sync',
      accessorFn: (row) => row.status?.sync?.status || 'Unknown',
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => (
        <StatusBadge status={normalizeStatus(row.original.status?.sync?.status)} />
      ),
    },
    {
      id: 'health',
      header: 'Health',
      accessorFn: (row) => row.status?.health?.status || 'Unknown',
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => (
        <StatusBadge status={normalizeStatus(row.original.status?.health?.status)} />
      ),
    },
    {
      id: 'source',
      header: 'Source',
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => {
        const source = getArgoCDAppSourceSummary(row.original);
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] font-normal">{source.type}</Badge>
              <span className="font-mono text-xs truncate">{source.name}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{source.repoURL}</div>
          </div>
        );
      },
    },
    {
      id: 'revision',
      header: 'Target',
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => {
        const source = getArgoCDAppSourceSummary(row.original);
        return <span className="font-mono text-xs">{source.revision}</span>;
      },
    },
    {
      id: 'destination',
      header: 'Destination',
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => (
        <span className="font-mono text-xs">
          {row.original.spec?.destination?.namespace || '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }: CellContext<ArgoCDApplication, unknown>) => {
        const app = row.original;
        const name = app.metadata?.name;
        const namespace = app.metadata?.namespace;
        if (!name || !namespace) return null;
        return (
          <ArgoCDActionButtons
            clusterId={decodedClusterId}
            appName={name}
            namespace={namespace}
            onChanged={() => mutate()}
            compact
          />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Layers3 className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ArgoCD Apps</h1>
          <p className="text-sm text-muted-foreground">
            {apps.length} application{apps.length !== 1 ? 's' : ''} across all namespaces
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5" />
        Sync acts on ArgoCD Applications. Helm chart releases managed only through ArgoCD appear here, not under Helm Releases.
      </div>

      <DataTable
        columns={columns}
        data={apps}
        searchPlaceholder="Search ArgoCD apps..."
      />
    </div>
  );
}
