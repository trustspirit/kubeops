'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCustomResourceDetail } from '@/hooks/use-custom-resource-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { AgeDisplay } from '@/components/shared/age-display';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState } from 'react';

export function CrDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clusterId = params.clusterId as string;
  const resourcePath = params.resourcePath as string[];
  const [group, version, plural, name] = resourcePath || [];
  const namespace = searchParams.get('ns') || undefined;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, error, isLoading, mutate } = useCustomResourceDetail({
    clusterId: clusterId ? decodeURIComponent(clusterId) : null,
    group,
    version,
    plural,
    name,
    namespace,
  });

  const nsParam = namespace ? `?namespace=${namespace}` : '';
  const yamlApiUrl = `/api/clusters/${clusterId}/crds/${group}/${version}/${plural}/${name}${nsParam}`;

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;
  if (!data) return null;

  const resource = data;
  const metadata = resource.metadata || {};
  const labels = metadata.labels || {};
  const annotations = metadata.annotations || {};

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(yamlApiUrl);
      toast.success(`${name} deleted`);
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{metadata.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{group}/{version}</span>
            {metadata.namespace && ` in ${metadata.namespace}`}
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">API Version</span>
                  <span className="font-mono text-xs">{resource.apiVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kind</span>
                  <span className="font-mono text-xs">{resource.kind}</span>
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

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={resource}
            apiUrl={yamlApiUrl}
            onSaved={() => mutate()}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${metadata.name}?`}
        description={`This will permanently delete "${metadata.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
