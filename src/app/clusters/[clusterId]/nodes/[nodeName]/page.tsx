'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Bug } from 'lucide-react';
import { RESOURCE_LABELS } from '@/lib/constants';
import { AgeDisplay } from '@/components/shared/age-display';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { NodeDebugDialog } from '@/components/nodes/node-debug-dialog';

export default function NodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const nodeName = params.nodeName as string;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace: '_',
    resourceType: 'nodes',
    name: nodeName,
  });

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
      await apiClient.delete(`/api/clusters/${clusterId}/resources/_/nodes/${nodeName}`);
      toast.success(`${nodeName} deleted`);
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
            {RESOURCE_LABELS['nodes'] || 'Node'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setDebugOpen(true)}>
          <Bug className="h-4 w-4 mr-1" />
          Debug Shell
        </Button>
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

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={resource}
            apiUrl={`/api/clusters/${clusterId}/resources/_/nodes/${nodeName}`}
            onSaved={() => mutate()}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${metadata.name}?`}
        description={`This will permanently delete the node "${metadata.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      <NodeDebugDialog
        open={debugOpen}
        onOpenChange={setDebugOpen}
        clusterId={decodedClusterId}
        nodeName={nodeName}
      />
    </div>
  );
}
