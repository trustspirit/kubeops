'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useHelmReleases } from '@/hooks/use-helm-releases';
import { DataTable } from '@/components/shared/data-table';
import { ListSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { helmReleaseColumns } from '@/components/resources/resource-columns';
import { HelmInstallDialog } from '@/components/helm/helm-install-dialog';
import { Button } from '@/components/ui/button';
import { Ship, Plus, AlertTriangle } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

export default function HelmReleasesPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const [installOpen, setInstallOpen] = useState(false);

  const { data, error, isLoading, mutate } = useHelmReleases({
    clusterId: decodedClusterId,
  });

  if (isLoading) return <ListSkeleton />;

  // Handle helm not available (503)
  if (error && (error as any).status === 503) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Ship className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Helm Releases</h1>
            <p className="text-sm text-muted-foreground">Manage Helm chart releases</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mb-3" />
          <p className="text-sm font-medium">Helm CLI Not Found</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            The Helm CLI is required to manage chart releases. Install Helm from{' '}
            <span className="font-mono">https://helm.sh/docs/intro/install/</span>{' '}
            and make sure it is available in your PATH.
          </p>
        </div>
      </div>
    );
  }

  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;

  const releases = data?.releases || [];

  // Make name column clickable to the detail page
  const clickableColumns: ColumnDef<any>[] = helmReleaseColumns.map((col: any) => {
    if (col.id === 'name') {
      return {
        ...col,
        cell: ({ row }: any) => {
          const name = row.original.name;
          const ns = row.original.namespace;
          return (
            <Link
              href={`/clusters/${clusterId}/helm/${encodeURIComponent(name)}?namespace=${encodeURIComponent(ns)}`}
              className="font-medium text-primary hover:underline"
            >
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
        <div className="flex items-center gap-3">
          <Ship className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Helm Releases</h1>
            <p className="text-sm text-muted-foreground">
              {releases.length} release{releases.length !== 1 ? 's' : ''} across all namespaces
            </p>
          </div>
        </div>
        <Button onClick={() => setInstallOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Install Chart
        </Button>
      </div>

      <DataTable
        columns={clickableColumns}
        data={releases}
        searchPlaceholder="Search releases..."
      />

      <HelmInstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        clusterId={decodedClusterId}
        onInstalled={() => mutate()}
      />
    </div>
  );
}
