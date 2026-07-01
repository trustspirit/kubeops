'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, GitBranch, Layers3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { StatusBadge } from '@/components/shared/status-badge';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { useCustomResourceDetail } from '@/hooks/use-custom-resource-detail';
import { useCustomResourceList } from '@/hooks/use-custom-resource-list';
import { ArgoCDActionButtons } from '@/components/argocd/argocd-action-buttons';
import {
  ARGOCD_APPLICATIONS_PLURAL,
  ARGOCD_GROUP,
  ARGOCD_VERSION,
  getArgoCDAppApiUrl,
  getArgoCDAppSourceSummary,
  type ArgoCDApplication,
} from '@/lib/argocd/helpers';

function TextRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-right break-all">{value || '-'}</span>
    </div>
  );
}

export default function ArgoCDAppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clusterId = params.clusterId as string;
  const appName = decodeURIComponent(params.appName as string);
  const decodedClusterId = decodeURIComponent(clusterId);
  const namespaceParam = searchParams.get('namespace') || undefined;

  const { data: allAppsData, error: listError, isLoading: listLoading } = useCustomResourceList({
    clusterId: namespaceParam ? null : decodedClusterId,
    group: ARGOCD_GROUP,
    version: ARGOCD_VERSION,
    plural: ARGOCD_APPLICATIONS_PLURAL,
    refreshInterval: 10000,
    enabled: !namespaceParam,
  });

  const appMatch = useMemo(() => {
    if (namespaceParam) return null;
    const matches = ((allAppsData?.items || []) as ArgoCDApplication[])
      .filter((app) => app.metadata?.name === appName);
    return matches.length === 1 ? matches[0] : null;
  }, [allAppsData, appName, namespaceParam]);

  const ambiguousMatches = useMemo(() => {
    if (namespaceParam) return [];
    return ((allAppsData?.items || []) as ArgoCDApplication[])
      .filter((app) => app.metadata?.name === appName);
  }, [allAppsData, appName, namespaceParam]);

  const resolvedNamespace = namespaceParam || appMatch?.metadata?.namespace;

  const { data, error, isLoading, mutate } = useCustomResourceDetail({
    clusterId: resolvedNamespace ? decodedClusterId : null,
    group: ARGOCD_GROUP,
    version: ARGOCD_VERSION,
    plural: ARGOCD_APPLICATIONS_PLURAL,
    name: appName,
    namespace: resolvedNamespace,
    refreshInterval: 10000,
    enabled: Boolean(resolvedNamespace),
  });

  if (!namespaceParam && listLoading) return <LoadingSkeleton />;
  if (!namespaceParam && listError) return <ErrorDisplay error={listError} onRetry={() => router.refresh()} clusterId={clusterId} />;
  if (!namespaceParam && ambiguousMatches.length > 1) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/clusters/${clusterId}/argocd`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{appName}</h1>
            <p className="text-sm text-muted-foreground">Multiple ArgoCD Applications have this name. Open it from the ArgoCD Apps list.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!namespaceParam && !resolvedNamespace) {
    return <ErrorDisplay error={new Error(`ArgoCD Application "${appName}" was not found`)} clusterId={clusterId} />;
  }

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;
  if (!data || !resolvedNamespace) return null;

  const app = data as ArgoCDApplication;
  const metadata = app.metadata || {};
  const source = getArgoCDAppSourceSummary(app);
  const syncStatus = app.status?.sync?.status || 'Unknown';
  const healthStatus = app.status?.health?.status || 'Unknown';
  const apiUrl = getArgoCDAppApiUrl(decodedClusterId, appName, resolvedNamespace);
  const operation = app.status?.operationState;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/clusters/${clusterId}/argocd`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Layers3 className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{metadata.name}</h1>
            <StatusBadge status={syncStatus} />
            <StatusBadge status={healthStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            ArgoCD Application in {resolvedNamespace}
          </p>
        </div>
        <ArgoCDActionButtons
          clusterId={decodedClusterId}
          appName={appName}
          namespace={resolvedNamespace}
          onChanged={() => mutate()}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Source
              </h3>
              <div className="space-y-2 text-sm">
                <TextRow label="Type" value={source.type} />
                <TextRow label="Name" value={source.name} />
                <TextRow label="Target Revision" value={source.revision} />
                <TextRow label="Repo" value={source.repoURL} />
                <TextRow label="Live Revision" value={app.status?.sync?.revision} />
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Destination</h3>
              <div className="space-y-2 text-sm">
                <TextRow label="Project" value={app.spec?.project} />
                <TextRow label="Namespace" value={app.spec?.destination?.namespace} />
                <TextRow label="Cluster" value={app.spec?.destination?.name || app.spec?.destination?.server} />
                <TextRow label="Operation" value={operation?.phase} />
              </div>
              {operation?.message && (
                <p className="text-xs text-muted-foreground border-t pt-2">{operation.message}</p>
              )}
            </div>
          </div>

          {app.status?.summary?.images && app.status.summary.images.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Images</h3>
              <div className="rounded-md border p-3 flex flex-wrap gap-1">
                {app.status.summary.images.map((image) => (
                  <Badge key={image} variant="secondary" className="font-mono text-[11px] font-normal">
                    {image}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={app}
            apiUrl={apiUrl}
            onSaved={() => mutate()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
