'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { useResourceList } from '@/hooks/use-resource-list';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { AgeDisplay } from '@/components/shared/age-display';
import { ScaleDialog } from '@/components/resources/scale-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { PodMetricsCharts } from '@/components/shared/metrics-charts';
import { ArrowLeft, Trash2, Scaling, Terminal, ScrollText, RotateCcw, GitCompare } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState } from 'react';
import Link from 'next/link';
import { usePanelStore } from '@/stores/panel-store';
import { PortForwardBtn } from '@/components/shared/port-forward-btn';
import { ResourceTreeView } from '@/components/shared/resource-tree';
import { useResourceTree } from '@/hooks/use-resource-tree';
import { ResourceDiffDialog } from '@/components/shared/resource-diff-dialog';
import type { KubeResource, ContainerSpec, ContainerStatus } from '@/types/resource';

export default function StatefulSetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const { addTab } = usePanelStore();

  const decodedClusterId = decodeURIComponent(clusterId);

  const { data: sts, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'statefulsets',
    name,
  });

  // Resource tree
  const { nodes: treeNodes, edges: treeEdges, isLoading: treeLoading } = useResourceTree({
    clusterId: decodedClusterId,
    namespace,
    rootKind: 'StatefulSet',
    rootName: name,
  });

  // Get pods belonging to this statefulset
  const { data: podsData } = useResourceList({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'pods',
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;
  if (!sts) return null;

  const metadata = sts.metadata || {};
  const spec = sts.spec || {};
  const status = sts.status || {};
  const labels = metadata.labels || {};

  // Filter pods by statefulset ownership
  const stsPods = (podsData?.items || []).filter((p: KubeResource) =>
    p.metadata?.ownerReferences?.some((ref) => ref.kind === 'StatefulSet' && ref.name === name)
    || p.metadata?.name?.startsWith(`${name}-`)
  );

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await apiClient.patch(`/api/clusters/${clusterId}/resources/${namespace}/statefulsets/${name}`, {
        spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } }
      });
      toast.success(`${name} restarting...`);
      mutate();
    } catch (err: unknown) {
      toast.error(`Restart failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setRestarting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/clusters/${clusterId}/resources/${namespace}/statefulsets/${name}`);
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            <StatusBadge status={status.readyReplicas === spec.replicas ? 'Ready' : 'Pending'} />
          </div>
          <p className="text-sm text-muted-foreground">StatefulSet in {namespace} - Ready: {status.readyReplicas || 0}/{spec.replicas || 0}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
            <GitCompare className="h-4 w-4 mr-1" />Compare
          </Button>
          <Button variant="outline" size="sm" onClick={handleRestart} disabled={restarting}>
            <RotateCcw className={`h-4 w-4 mr-1 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? 'Restarting...' : 'Restart'}
          </Button>
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
          {/* Resource Tree */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Resource Tree</h3>
            <ResourceTreeView
              treeNodes={treeNodes}
              treeEdges={treeEdges}
              isLoading={treeLoading}
              height={300}
            />
          </div>

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

          {/* Pod Metrics */}
          {stsPods.length > 0 && (
            <PodMetricsCharts
              clusterId={decodedClusterId}
              namespace={namespace}
              podName={stsPods[0].metadata?.name}
              nodeName={stsPods[0].spec?.nodeName}
            />
          )}

          {/* Containers & Ports */}
          {(spec.template?.spec?.containers || []).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Containers</h3>
              {(spec.template?.spec?.containers || []).map((ctr: ContainerSpec, idx: number) => (
                <div key={idx} className="rounded-md border p-3 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{ctr.name}</span>
                    <span className="font-mono text-xs text-muted-foreground break-all text-right max-w-[300px]">{ctr.image}</span>
                  </div>
                  {ctr.ports && ctr.ports.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ctr.ports.map((p, pi: number) => (
                        <div key={pi} className="inline-flex items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-[11px] font-normal">
                            {p.containerPort}/{p.protocol || 'TCP'}
                            {p.name && <span className="text-muted-foreground ml-1">({p.name})</span>}
                          </Badge>
                          {stsPods.length > 0 && (
                            <PortForwardBtn
                              clusterId={decodedClusterId}
                              namespace={namespace}
                              resourceType="pod"
                              resourceName={stsPods[0].metadata?.name}
                              port={p.containerPort}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pods */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pods ({stsPods.length})</h3>
            {stsPods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pods found for this StatefulSet.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Restarts</th>
                      <th className="px-3 py-2 text-left font-medium">Node</th>
                      <th className="px-3 py-2 text-left font-medium">Age</th>
                      <th className="px-3 py-2 text-left font-medium w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stsPods.map((pod: KubeResource) => {
                      const pName = pod.metadata?.name;
                      const podStatus = pod.status as { phase?: string; containerStatuses?: ContainerStatus[] } | undefined;
                      const podSpec = pod.spec as { containers?: ContainerSpec[]; nodeName?: string } | undefined;
                      const pPhase = pod.metadata?.deletionTimestamp ? 'Terminating' : (podStatus?.phase || 'Unknown');
                      const restarts = (podStatus?.containerStatuses || []).reduce((s: number, c: ContainerStatus) => s + (c.restartCount || 0), 0);
                      const firstContainer = podSpec?.containers?.[0]?.name;

                      return (
                        <tr key={pName} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Link href={`/clusters/${clusterId}/namespaces/${namespace}/pods/${pName}`} className="text-primary hover:underline font-medium">
                              {pName}
                            </Link>
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={pPhase} /></td>
                          <td className="px-3 py-2">{restarts > 0 ? <span className="text-red-500 font-medium">{restarts}</span> : 0}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{podSpec?.nodeName?.split('.')[0] || '-'}</td>
                          <td className="px-3 py-2"><AgeDisplay timestamp={pod.metadata?.creationTimestamp} /></td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Logs" onClick={() => firstContainer && addTab({ id: `logs-${pName}-${firstContainer}`, type: 'logs', title: `Logs: ${pName}`, clusterId, namespace, podName: pName, container: firstContainer })}>
                                <ScrollText className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Exec" onClick={() => firstContainer && addTab({ id: `exec-${pName}-${firstContainer}`, type: 'exec', title: `Exec: ${pName}`, clusterId, namespace, podName: pName, container: firstContainer })}>
                                <Terminal className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete Pod" onClick={async () => {
                                if (!confirm(`Delete pod ${pName}?`)) return;
                                try {
                                  await apiClient.delete(`/api/clusters/${clusterId}/resources/${namespace}/pods/${pName}`);
                                  toast.success(`${pName} deleted`);
                                } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Unknown error'); }
                              }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={sts}
            apiUrl={`/api/clusters/${clusterId}/resources/${namespace}/statefulsets/${name}`}
            onSaved={() => mutate()}
          />
        </TabsContent>
      </Tabs>

      <ScaleDialog open={scaleOpen} onOpenChange={setScaleOpen} clusterId={decodedClusterId} namespace={namespace} resourceType="statefulsets" name={name} currentReplicas={spec.replicas || 0} onScaled={() => mutate()} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${name}?`} description={`This will permanently delete the statefulset "${name}".`} confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={deleting} />
      <ResourceDiffDialog open={compareOpen} onOpenChange={setCompareOpen} sourceClusterId={clusterId} sourceNamespace={namespace} resourceType="statefulsets" resourceName={name} sourceResource={sts} />
    </div>
  );
}
