'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay, RefreshFailedBanner } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, GitCompare, Globe } from 'lucide-react';
import { RESOURCE_LABELS } from '@/lib/constants';
import { AgeDisplay } from '@/components/shared/age-display';
import { useState, useMemo, useCallback } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CascadeDeleteDialog } from '@/components/shared/cascade-delete-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { toPortableYaml } from '@/lib/portable-manifest';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { ResourceDiffDialog } from '@/components/shared/resource-diff-dialog';
import { MultiClusterApplyDialog } from '@/components/multi-cluster/multi-cluster-apply-dialog';
import { useSWRConfig } from 'swr';
import { isResourceListCacheKey } from '@/lib/resource-freshness';
import { ArgoCDWorkloadBar } from '@/components/argocd/argocd-workload-bar';

interface ResourceDetailPageProps {
  resourceType: string;
  clusterScoped?: boolean;
  children?: React.ReactNode;
}

export function ResourceDetailPage({ resourceType, clusterScoped, children }: ResourceDetailPageProps) {
  const params = useParams();
  const router = useRouter();
  const { mutate: mutateCache } = useSWRConfig();
  const clusterId = params.clusterId as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : '';
  const namespace = (params.namespace as string) || '_';
  const name = (params.name as string) || (params.podName as string) || (params.nodeName as string);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [multiApplyOpen, setMultiApplyOpen] = useState(false);
  const [yamlDirty, setYamlDirty] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const handleDirtyChange = useCallback((dirty: boolean) => setYamlDirty(dirty), []);

  const { data, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodedClusterId || null,
    namespace: clusterScoped ? '_' : namespace,
    resourceType,
    name,
  });

  const yamlApiUrl = clusterScoped
    ? `/api/clusters/${clusterId}/resources/_/${resourceType}/${name}`
    : `/api/clusters/${clusterId}/resources/${namespace}/${resourceType}/${name}`;

  // Seeded from polled data, but the dialog snapshots it on open; status and
  // server-owned metadata are stripped so the seed is portable and stable.
  const resourceYaml = useMemo(
    () => (multiApplyOpen ? toPortableYaml(data) : ''),
    [multiApplyOpen, data],
  );

  // Leaving the page drops unapplied YAML edits; switching tabs does not
  // (the YAML tab stays mounted), so only navigation away needs a guard.
  const goBack = () => {
    if (yamlDirty) {
      setLeaveConfirmOpen(true);
      return;
    }
    router.back();
  };

  if (isLoading && !data) return <LoadingSkeleton />;
  // Keep showing the last good copy (and any unsaved YAML edits) when a
  // background refresh fails; only a first load with nothing to show is fatal.
  if (error && !data) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;
  if (!data) return null;

  const resource = data;
  const metadata = resource.metadata || {};
  const labels = metadata.labels || {};
  const annotations = metadata.annotations || {};

  const handleDelete = async (propagationPolicy?: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const base = clusterScoped
        ? `/api/clusters/${clusterId}/resources/_/${resourceType}/${name}`
        : `/api/clusters/${clusterId}/resources/${namespace}/${resourceType}/${name}`;
      // The cascade dialog's policy choice used to be dropped here, so
      // "Orphan" still cascaded.
      const url = propagationPolicy
        ? `${base}?propagationPolicy=${encodeURIComponent(propagationPolicy)}`
        : base;
      await apiClient.delete(url);
      void mutateCache(
        (key) => isResourceListCacheKey(key, decodedClusterId, resourceType),
      ).catch(() => {
        // Deletion succeeded; normal polling or Watch recovery will reconcile the list.
      });
      toast.success(`${name} deletion requested`);
      router.back();
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {error && <RefreshFailedBanner error={error} onRetry={() => mutate()} />}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{metadata.name}</h1>
          <p className="text-sm text-muted-foreground">
            {RESOURCE_LABELS[resourceType] || resourceType}
            {metadata.namespace && ` in ${metadata.namespace}`}
          </p>
        </div>
        {!clusterScoped && (
          <Button variant="outline" size="sm" onClick={() => setMultiApplyOpen(true)}>
            <Globe className="h-4 w-4 mr-1" />
            Multi-cluster Apply
          </Button>
        )}
        {!clusterScoped && (
          <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
            <GitCompare className="h-4 w-4 mr-1" />
            Compare
          </Button>
        )}
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>

      <ArgoCDWorkloadBar clusterId={decodedClusterId} namespace={metadata.namespace} resources={[resource]} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {children && <TabsTrigger value="extra">Details</TabsTrigger>}
          <TabsTrigger value="yaml">
            YAML
            {yamlDirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" title="Unsaved changes" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Metadata</h3>
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-mono">{metadata.name}</span>
                </div>
                {metadata.namespace && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Namespace</span>
                    <span className="font-mono">{metadata.namespace}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">UID</span>
                  <span className="font-mono text-xs">{metadata.uid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Age</span>
                  <AgeDisplay timestamp={metadata.creationTimestamp} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Labels</h3>
              <div className="rounded-md border p-3 flex flex-wrap gap-1">
                {Object.entries(labels).length > 0 ? (
                  Object.entries(labels).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="text-xs font-mono">
                      {k}={v as string}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No labels</span>
                )}
              </div>
            </div>
          </div>

          {Object.entries(annotations).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Annotations</h3>
              <div className="rounded-md border p-3 space-y-1">
                {Object.entries(annotations).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="font-mono text-muted-foreground">{k}</span>
                    <span className="font-mono ml-2 break-all">{v as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {children && (
          <TabsContent value="extra" className="mt-4">
            {children}
          </TabsContent>
        )}

        {/*
          Force-mounted so in-progress edits survive switching tabs; Radix
          marks it inactive and the class hides it.
        */}
        <TabsContent value="yaml" forceMount className="mt-4 data-[state=inactive]:hidden">
          <YamlEditor
            data={resource}
            apiUrl={yamlApiUrl}
            onSaved={() => mutate()}
            onDirtyChange={handleDirtyChange}
            portForwardContext={
              !clusterScoped && (resourceType === 'services' || resourceType === 'pods')
                ? {
                    clusterId: decodeURIComponent(clusterId),
                    namespace,
                    resourceType: resourceType === 'services' ? 'svc' : 'pod',
                    resourceName: name,
                  }
                : undefined
            }
            clusterScoped={clusterScoped}
          />
        </TabsContent>
      </Tabs>

      {['deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs'].includes(resourceType) && !clusterScoped ? (
        <CascadeDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          clusterId={decodeURIComponent(clusterId)}
          namespace={namespace}
          resourceType={resourceType}
          name={name}
          onConfirm={(propagationPolicy) => handleDelete(propagationPolicy)}
          loading={deleting}
        />
      ) : (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${metadata.name}?`}
          description={`This will permanently delete the ${resourceType.slice(0, -1)} "${metadata.name}". This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => handleDelete()}
          loading={deleting}
        />
      )}

      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title="Leave with unsaved changes?"
        description="Your YAML edits have not been applied and will be lost."
        confirmLabel="Leave"
        variant="destructive"
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          router.back();
        }}
      />

      {!clusterScoped && (
        <ResourceDiffDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          sourceClusterId={clusterId}
          sourceNamespace={namespace}
          resourceType={resourceType}
          resourceName={name}
          sourceResource={resource}
        />
      )}

      {!clusterScoped && (
        <MultiClusterApplyDialog
          open={multiApplyOpen}
          onOpenChange={setMultiApplyOpen}
          initialYaml={resourceYaml}
        />
      )}
    </div>
  );
}
