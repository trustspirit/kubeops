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
import { ArrowLeft, Trash2, Scaling, Terminal, ScrollText, RotateCcw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState } from 'react';
import { usePanelStore } from '@/stores/panel-store';
import useSWR from 'swr';
import Link from 'next/link';
import { PortForwardBtn } from '@/components/shared/port-forward-btn';

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const name = params.name as string;
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { addTab } = usePanelStore();

  const decodedClusterId = decodeURIComponent(clusterId);

  const { data: dep, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'deployments',
    name,
  });

  // ReplicaSets for revision history
  const { data: rsData } = useResourceList({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'replicasets',
  });

  // Pods
  const { data: podsData } = useResourceList({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'pods',
  });

  // Events
  const { data: eventsData } = useResourceList({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'events',
  });

  // Pod metrics
  const { data: metricsData } = useSWR(
    `/api/clusters/${encodeURIComponent(decodedClusterId)}/metrics?type=pods&namespace=${namespace}`,
    { refreshInterval: 10000 }
  );

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} />;
  if (!dep) return null;

  const metadata = dep.metadata || {};
  const spec = dep.spec || {};
  const status = dep.status || {};
  const labels = metadata.labels || {};
  const uid = metadata.uid;

  // Filter ReplicaSets owned by this deployment
  const replicaSets = (rsData?.items || [])
    .filter((rs: any) => rs.metadata?.ownerReferences?.some((ref: any) => ref.uid === uid))
    .sort((a: any, b: any) => {
      const revA = parseInt(a.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '0');
      const revB = parseInt(b.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '0');
      return revB - revA;
    });

  // Filter Pods owned by this deployment's replicasets
  const rsUids = new Set(replicaSets.map((rs: any) => rs.metadata?.uid));
  const depPods = (podsData?.items || [])
    .filter((p: any) => p.metadata?.ownerReferences?.some((ref: any) => rsUids.has(ref.uid)));

  // Filter events for this deployment and its pods
  const depEvents = (eventsData?.items || [])
    .filter((e: any) => {
      const obj = e.involvedObject;
      if (obj?.kind === 'Deployment' && obj?.name === name) return true;
      if (obj?.kind === 'ReplicaSet' && replicaSets.some((rs: any) => rs.metadata?.name === obj?.name)) return true;
      if (obj?.kind === 'Pod' && depPods.some((p: any) => p.metadata?.name === obj?.name)) return true;
      return false;
    })
    .sort((a: any, b: any) => new Date(b.lastTimestamp || b.metadata?.creationTimestamp).getTime() - new Date(a.lastTimestamp || a.metadata?.creationTimestamp).getTime())
    .slice(0, 50);

  // Pod metrics lookup
  const metricsMap: Record<string, { cpu: string; memory: string }> = {};
  (metricsData?.items || []).forEach((pm: any) => {
    const podName = pm.metadata?.name;
    let cpu = 0, mem = 0;
    (pm.containers || []).forEach((c: any) => {
      const cpuStr = c.usage?.cpu || '0';
      const memStr = c.usage?.memory || '0';
      cpu += cpuStr.endsWith('n') ? parseInt(cpuStr) / 1e6 : cpuStr.endsWith('u') ? parseInt(cpuStr) / 1e3 : cpuStr.endsWith('m') ? parseInt(cpuStr) : parseFloat(cpuStr) * 1000;
      mem += memStr.endsWith('Ki') ? parseInt(memStr) / 1024 : memStr.endsWith('Mi') ? parseInt(memStr) : memStr.endsWith('Gi') ? parseInt(memStr) * 1024 : parseInt(memStr) / (1024 * 1024);
    });
    metricsMap[podName] = { cpu: `${Math.round(cpu)}m`, memory: `${Math.round(mem)}Mi` };
  });

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await apiClient.patch(`/api/clusters/${clusterId}/resources/${namespace}/deployments/${name}`, {
        spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } }
      });
      toast.success(`${name} restarting...`);
      mutate();
    } catch (err: any) {
      toast.error(`Restart failed: ${err.message}`);
    } finally { setRestarting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/clusters/${clusterId}/resources/${namespace}/deployments/${name}`);
      toast.success(`${name} deleted`);
      router.back();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally { setDeleting(false); setDeleteOpen(false); }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            <StatusBadge status={status.availableReplicas > 0 ? 'Available' : 'Pending'} />
          </div>
          <p className="text-sm text-muted-foreground">
            Deployment in {namespace} — Ready: {status.readyReplicas || 0}/{spec.replicas || 0}
            {' · '}Revision: {replicaSets[0]?.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '-'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRestart} disabled={restarting}>
            <RotateCcw className={`h-4 w-4 mr-1 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? 'Restarting...' : 'Restart'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setScaleOpen(true)}>
            <Scaling className="h-4 w-4 mr-1" />Scale
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revisions">Revisions ({replicaSets.length})</TabsTrigger>
          <TabsTrigger value="events">Events ({depEvents.length})</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Compact info table */}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[90px]">Replicas</td>
                  <td className="px-3 py-1.5">{status.readyReplicas || 0}/{spec.replicas || 0} ready</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[90px]">Strategy</td>
                  <td className="px-3 py-1.5">{spec.strategy?.type || '-'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[90px]">Age</td>
                  <td className="px-3 py-1.5"><AgeDisplay timestamp={metadata.creationTimestamp} /></td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Image</td>
                  <td className="px-3 py-1.5 font-mono break-all" colSpan={5}>{spec.template?.spec?.containers?.[0]?.image || '-'}</td>
                </tr>
                {(spec.template?.spec?.containers || []).some((c: any) => c.ports?.length > 0) && (
                  <tr className="border-b">
                    <td className="px-3 py-1.5 text-muted-foreground font-medium align-top">Ports</td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      <div className="flex flex-wrap gap-2">
                        {(spec.template?.spec?.containers || []).flatMap((ctr: any) => (ctr.ports || []).map((p: any, pi: number) => (
                          <div key={`${ctr.name}-${pi}`} className="inline-flex items-center gap-1.5">
                            <Badge variant="outline" className="font-mono text-[10px] font-normal py-0 h-5">
                              {p.containerPort}/{p.protocol || 'TCP'}
                              {p.name && <span className="text-muted-foreground ml-1">({p.name})</span>}
                            </Badge>
                            {depPods.length > 0 && (
                              <PortForwardBtn clusterId={decodedClusterId} namespace={namespace} resourceType="pod" resourceName={depPods[0].metadata?.name} port={p.containerPort} />
                            )}
                          </div>
                        )))}
                      </div>
                    </td>
                  </tr>
                )}
                {Object.entries(labels).length > 0 && (
                  <tr className="border-b">
                    <td className="px-3 py-1.5 text-muted-foreground font-medium align-top">Labels</td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(labels).map(([k, v]) => (
                          <Badge key={k} variant="secondary" className="text-[10px] font-mono font-normal py-0 h-5">{k}={v as string}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                {spec.selector?.matchLabels && (
                  <tr className="border-b">
                    <td className="px-3 py-1.5 text-muted-foreground font-medium align-top">Selector</td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(spec.selector.matchLabels).map(([k, v]) => (
                          <Badge key={k} variant="outline" className="text-[10px] font-mono font-normal py-0 h-5">{k}={v as string}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                {(status.conditions || []).length > 0 && (
                  <tr>
                    <td className="px-3 py-1.5 text-muted-foreground font-medium align-top">Status</td>
                    <td className="px-3 py-1.5" colSpan={5}>
                      <div className="flex flex-wrap gap-1.5">
                        {(status.conditions || []).map((c: any, i: number) => (
                          <Badge key={i} variant={c.status === 'True' ? 'default' : 'outline'} className="text-[10px] font-normal py-0 h-5 gap-1">
                            {c.type}
                            {c.status !== 'True' && <span className="text-muted-foreground">({c.reason || c.status})</span>}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pod Metrics */}
          {depPods.length > 0 && (
            <PodMetricsCharts
              clusterId={decodedClusterId}
              namespace={namespace}
              podName={depPods[0].metadata?.name}
              nodeName={depPods[0].spec?.nodeName}
            />
          )}

          {/* Pods in Overview */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pods ({depPods.length})</h3>
            {depPods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pods found.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Ready</th>
                      <th className="px-3 py-2 text-left font-medium">Restarts</th>
                      <th className="px-3 py-2 text-left font-medium">Node</th>
                      <th className="px-3 py-2 text-left font-medium">CPU</th>
                      <th className="px-3 py-2 text-left font-medium">Memory</th>
                      <th className="px-3 py-2 text-left font-medium">Age</th>
                      <th className="px-3 py-2 text-left font-medium w-[80px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {depPods.map((pod: any) => {
                      const pName = pod.metadata?.name;
                      const pPhase = pod.metadata?.deletionTimestamp ? 'Terminating' : (pod.status?.phase || 'Unknown');
                      const statuses = pod.status?.containerStatuses || [];
                      const readyCt = statuses.filter((c: any) => c.ready).length;
                      const totalCt = statuses.length || pod.spec?.containers?.length || 0;
                      const restarts = statuses.reduce((s: number, c: any) => s + (c.restartCount || 0), 0);
                      const metrics = metricsMap[pName];
                      const firstContainer = pod.spec?.containers?.[0]?.name;

                      return (
                        <tr key={pName} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <Link href={`/clusters/${clusterId}/namespaces/${namespace}/pods/${pName}`} className="text-primary hover:underline font-medium">
                              {pName}
                            </Link>
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={pPhase} /></td>
                          <td className="px-3 py-2">{readyCt}/{totalCt}</td>
                          <td className="px-3 py-2">{restarts > 0 ? <span className="text-red-500 font-medium">{restarts}</span> : 0}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground text-xs">{pod.spec?.nodeName?.split('.')[0] || '-'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{metrics?.cpu || '-'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{metrics?.memory || '-'}</td>
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
                                } catch (err: any) { toast.error(err.message); }
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

        {/* Revisions */}
        <TabsContent value="revisions" className="mt-4">
          {replicaSets.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No revisions found.</p>
          ) : (
            <div className="space-y-3">
              {replicaSets.map((rs: any) => {
                const rev = rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '?';
                const rsReplicas = rs.spec?.replicas || 0;
                const rsReady = rs.status?.readyReplicas || 0;
                const rsImage = rs.spec?.template?.spec?.containers?.[0]?.image || '-';
                const isCurrent = rsReplicas > 0;
                const changeReason = rs.metadata?.annotations?.['kubernetes.io/change-cause'];

                return (
                  <div key={rs.metadata?.uid} className={`rounded-md border p-3 ${isCurrent ? 'border-primary/50 bg-primary/5' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={isCurrent ? 'default' : 'secondary'} className="text-xs">Rev {rev}</Badge>
                        {isCurrent && <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400">Current</Badge>}
                        <span className="text-xs text-muted-foreground">{rs.metadata?.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {rsReady}/{rsReplicas} ready · <AgeDisplay timestamp={rs.metadata?.creationTimestamp} />
                      </div>
                    </div>
                    <div className="mt-1.5 text-xs font-mono text-muted-foreground break-all">{rsImage}</div>
                    {changeReason && <div className="mt-1 text-xs text-muted-foreground italic">{changeReason}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Events */}
        <TabsContent value="events" className="mt-4">
          {depEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No events found.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-left font-medium">Object</th>
                    <th className="px-3 py-2 text-left font-medium">Message</th>
                    <th className="px-3 py-2 text-left font-medium">Count</th>
                    <th className="px-3 py-2 text-left font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {depEvents.map((e: any, i: number) => (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2"><StatusBadge status={e.type || 'Normal'} /></td>
                      <td className="px-3 py-2 font-medium">{e.reason || '-'}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono">{e.involvedObject?.kind}/{e.involvedObject?.name}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-md truncate">{e.message || '-'}</td>
                      <td className="px-3 py-2">{e.count || 1}</td>
                      <td className="px-3 py-2"><AgeDisplay timestamp={e.lastTimestamp || e.metadata?.creationTimestamp} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* YAML */}
        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={dep}
            apiUrl={`/api/clusters/${clusterId}/resources/${namespace}/deployments/${name}`}
            onSaved={() => mutate()}
          />
        </TabsContent>
      </Tabs>

      <ScaleDialog open={scaleOpen} onOpenChange={setScaleOpen} clusterId={decodedClusterId} namespace={namespace} resourceType="deployments" name={name} currentReplicas={spec.replicas || 0} onScaled={() => mutate()} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${name}?`} description={`This will permanently delete the deployment "${name}".`} confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
