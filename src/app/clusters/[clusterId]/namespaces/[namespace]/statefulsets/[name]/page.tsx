'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { AgeDisplay } from '@/components/shared/age-display';
import { ScaleDialog } from '@/components/resources/scale-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ArrowLeft, Trash2, Scaling } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState } from 'react';
import * as yaml from 'js-yaml';

export default function StatefulSetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: sts, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodeURIComponent(clusterId),
    namespace,
    resourceType: 'statefulsets',
    name,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} />;
  if (!sts) return null;

  const metadata = sts.metadata || {};
  const spec = sts.spec || {};
  const status = sts.status || {};
  const labels = metadata.labels || {};

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/clusters/${clusterId}/resources/${namespace}/statefulsets/${name}`);
      toast.success(`${name} deleted`);
      router.back();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            <StatusBadge status={status.readyReplicas === spec.replicas ? 'Ready' : 'Pending'} />
          </div>
          <p className="text-sm text-muted-foreground">StatefulSet in {namespace} - Ready: {status.readyReplicas || 0}/{spec.replicas || 0}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setScaleOpen(true)}>
            <Scaling className="h-4 w-4 mr-1" />
            Scale
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">StatefulSet Info</h3>
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Replicas</span><span>{spec.replicas || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ready</span><span>{status.readyReplicas || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current</span><span>{status.currentReplicas || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service Name</span><span className="font-mono">{spec.serviceName || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Update Strategy</span><span>{spec.updateStrategy?.type || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Age</span><AgeDisplay timestamp={metadata.creationTimestamp} /></div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Labels</h3>
              <div className="rounded-md border p-3 flex flex-wrap gap-1">
                {Object.entries(labels).length > 0 ? (
                  Object.entries(labels).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="text-xs font-mono">{k}={v as string}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No labels</span>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="yaml" className="mt-4">
          <pre className="rounded-md border bg-muted p-4 overflow-auto max-h-[600px] text-xs font-mono whitespace-pre">
            {yaml.dump(sts, { lineWidth: -1 })}
          </pre>
        </TabsContent>
      </Tabs>

      <ScaleDialog open={scaleOpen} onOpenChange={setScaleOpen} clusterId={decodeURIComponent(clusterId)} namespace={namespace} resourceType="statefulsets" name={name} currentReplicas={spec.replicas || 0} onScaled={() => mutate()} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${name}?`} description={`This will permanently delete the statefulset "${name}".`} confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
