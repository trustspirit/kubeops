'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useParams, useRouter } from 'next/navigation';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { AgeDisplay } from '@/components/shared/age-display';
import { ArrowLeft, Terminal, ScrollText, Trash2, KeyRound, GitCompare, Bug } from 'lucide-react';
import { useState, useMemo } from 'react';
import { usePanelStore } from '@/stores/panel-store';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PodDebugDialog } from '@/components/pods/pod-debug-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { PodMetricsCharts } from '@/components/shared/metrics-charts';
import { EnvValueCell, EnvFromRows, MountedSecretRows, PodLinkedSecrets } from '@/components/shared/env-value-resolver';
import { PortForwardBtn } from '@/components/shared/port-forward-btn';
import { PodWatchButton } from '@/components/pods/pod-watch-button';
import { usePodRestartWatcher } from '@/hooks/use-pod-watcher';
import { ResourceTreeView } from '@/components/shared/resource-tree';
import { useResourceTree } from '@/hooks/use-resource-tree';
import { ResourceDiffDialog } from '@/components/shared/resource-diff-dialog';

function PodResourceTree({ clusterId, namespace, rootKind, rootName, focusPodName }: {
  clusterId: string;
  namespace: string;
  rootKind: 'Deployment' | 'StatefulSet';
  rootName: string;
  focusPodName: string;
}) {
  const { nodes, edges, isLoading } = useResourceTree({ clusterId, namespace, rootKind, rootName });
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Resource Tree</h3>
      <ResourceTreeView
        treeNodes={nodes}
        treeEdges={edges}
        isLoading={isLoading}
        height={300}
        focusNodeId={`Pod/${focusPodName}`}
      />
    </div>
  );
}

export default function PodDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const podName = params.podName as string;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [envDrawerOpen, setEnvDrawerOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const { addTab } = usePanelStore();
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data: pod, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'pods',
    name: podName,
  });

  // Resolve pod's owner to determine tree root
  const ownerRef = pod?.metadata?.ownerReferences?.[0];

  const { data: ownerRS } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'replicasets',
    name: ownerRef?.name || '',
    enabled: ownerRef?.kind === 'ReplicaSet',
  });

  const treeRoot = useMemo(() => {
    if (!ownerRef) return null;
    if (ownerRef.kind === 'StatefulSet') {
      return { rootKind: 'StatefulSet' as const, rootName: ownerRef.name };
    }
    if (ownerRef.kind === 'ReplicaSet') {
      const depRef = ownerRS?.metadata?.ownerReferences?.find((r: any) => r.kind === 'Deployment');
      if (depRef) {
        return { rootKind: 'Deployment' as const, rootName: depRef.name };
      }
    }
    return null;
  }, [ownerRef, ownerRS]);

  // Watch for restarts on this single pod
  usePodRestartWatcher(decodedClusterId, pod ? [pod] : undefined);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />;
  if (!pod) return null;

  const metadata = pod.metadata || {};
  const spec = pod.spec || {};
  const status = pod.status || {};
  const containers = spec.containers || [];
  const containerStatuses = status.containerStatuses || [];
  const labels = metadata.labels || {};
  const phase = metadata.deletionTimestamp ? 'Terminating' : status.phase || 'Unknown';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/clusters/${clusterId}/resources/${namespace}/pods/${podName}`);
      toast.success(`${podName} deleted`);
      router.back();
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setDeleting(false); setDeleteOpen(false); }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{podName}</h1>
            <StatusBadge status={phase} />
          </div>
          <p className="text-sm text-muted-foreground">Pod in {namespace}</p>
        </div>
        <div className="flex gap-2">
          {containers.map((c: any) => c.name).slice(0, 1).map((containerName: string) => (
            <div key={containerName} className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addTab({
                  id: `logs-${podName}-${containerName}`,
                  type: 'logs',
                  title: `Logs: ${podName}`,
                  clusterId,
                  namespace,
                  podName,
                  container: containerName,
                })}
              >
                <ScrollText className="h-4 w-4 mr-1" />
                Logs
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addTab({
                  id: `exec-${podName}-${containerName}`,
                  type: 'exec',
                  title: `Exec: ${podName}`,
                  clusterId,
                  namespace,
                  podName,
                  container: containerName,
                })}
              >
                <Terminal className="h-4 w-4 mr-1" />
                Exec
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setDebugOpen(true)}>
            <Bug className="h-4 w-4 mr-1" />Debug
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
            <GitCompare className="h-4 w-4 mr-1" />Compare
          </Button>
          <PodWatchButton clusterId={decodedClusterId} namespace={namespace} podName={podName} />
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />Delete
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
          {treeRoot && (
            <PodResourceTree
              clusterId={decodedClusterId}
              namespace={namespace}
              rootKind={treeRoot.rootKind}
              rootName={treeRoot.rootName}
              focusPodName={podName}
            />
          )}

          {/* Metrics */}
          <PodMetricsCharts
            clusterId={decodedClusterId}
            namespace={namespace}
            podName={podName}
            nodeName={spec.nodeName}
          />

          {/* Pod Info compact */}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[100px]">Node</td>
                  <td className="px-3 py-1.5 font-mono">{spec.nodeName || '-'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[100px]">Pod IP</td>
                  <td className="px-3 py-1.5 font-mono">{status.podIP || '-'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium w-[100px]">Host IP</td>
                  <td className="px-3 py-1.5 font-mono">{status.hostIP || '-'}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">QoS</td>
                  <td className="px-3 py-1.5">{status.qosClass || '-'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Restart</td>
                  <td className="px-3 py-1.5">{spec.restartPolicy || '-'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">Age</td>
                  <td className="px-3 py-1.5"><AgeDisplay timestamp={metadata.creationTimestamp} /></td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-1.5 text-muted-foreground font-medium">SA</td>
                  <td className="px-3 py-1.5 font-mono" colSpan={5}>{spec.serviceAccountName || '-'}</td>
                </tr>
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

          {/* Containers */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Containers ({containers.length})</h3>
            {containers.map((ctr: any, idx: number) => {
              const cs = containerStatuses.find((s: any) => s.name === ctr.name);
              const stateKey = cs?.state ? Object.keys(cs.state)[0] : 'unknown';

              return (
                <div key={idx} className="rounded-md border overflow-hidden">
                  {/* Container header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{ctr.name}</h4>
                      <StatusBadge status={stateKey === 'running' ? 'Running' : stateKey === 'waiting' ? 'Pending' : stateKey === 'terminated' ? 'Failed' : 'Unknown'} />
                    </div>
                    <div className="flex items-center gap-3">
                      {cs && <span className="text-xs text-muted-foreground">Restarts: {cs.restartCount || 0}</span>}
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEnvDrawerOpen(true)}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                        Env ({(ctr.env || []).length + (ctr.envFrom || []).length})
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Container details table */}
                    <div className="rounded border overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody>
                          <tr className="border-b">
                            <td className="px-3 py-1.5 text-muted-foreground font-medium w-[120px]">Image</td>
                            <td className="px-3 py-1.5 font-mono break-all">{ctr.image}</td>
                          </tr>
                          {ctr.ports && ctr.ports.length > 0 && (
                            <tr className="border-b">
                              <td className="px-3 py-1.5 text-muted-foreground font-medium">Ports</td>
                              <td className="px-3 py-1.5">
                                <div className="flex flex-wrap gap-2">
                                  {ctr.ports.map((p: any, pi: number) => (
                                    <div key={pi} className="inline-flex items-center gap-1.5">
                                      <Badge variant="outline" className="font-mono text-[11px] font-normal">
                                        {p.containerPort}/{p.protocol || 'TCP'}
                                        {p.name && <span className="text-muted-foreground ml-1">({p.name})</span>}
                                      </Badge>
                                      <PortForwardBtn
                                        clusterId={decodedClusterId}
                                        namespace={namespace}
                                        resourceType="pod"
                                        resourceName={podName}
                                        port={p.containerPort}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          {ctr.command && (
                            <tr className="border-b">
                              <td className="px-3 py-1.5 text-muted-foreground font-medium">Command</td>
                              <td className="px-3 py-1.5 font-mono">{ctr.command.join(' ')}</td>
                            </tr>
                          )}
                          {ctr.args && (
                            <tr className="border-b">
                              <td className="px-3 py-1.5 text-muted-foreground font-medium">Args</td>
                              <td className="px-3 py-1.5 font-mono break-all">{ctr.args.join(' ')}</td>
                            </tr>
                          )}
                          {(ctr.resources?.requests || ctr.resources?.limits) && (
                            <tr className="border-b">
                              <td className="px-3 py-1.5 text-muted-foreground font-medium">Resources</td>
                              <td className="px-3 py-1.5">
                                <div className="flex gap-4">
                                  {ctr.resources?.requests && (
                                    <span>
                                      <span className="text-muted-foreground">Req: </span>
                                      CPU {ctr.resources.requests.cpu || '-'}, Mem {ctr.resources.requests.memory || '-'}
                                    </span>
                                  )}
                                  {ctr.resources?.limits && (
                                    <span>
                                      <span className="text-muted-foreground">Lim: </span>
                                      CPU {ctr.resources.limits.cpu || '-'}, Mem {ctr.resources.limits.memory || '-'}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {ctr.volumeMounts && ctr.volumeMounts.length > 0 && (
                            <tr className="border-b">
                              <td className="px-3 py-1.5 text-muted-foreground font-medium align-top">Mounts</td>
                              <td className="px-3 py-1.5">
                                <div className="space-y-0.5">
                                  {ctr.volumeMounts.map((vm: any, vi: number) => (
                                    <div key={vi} className="font-mono">
                                      <span>{vm.mountPath}</span>
                                      <span className="text-muted-foreground ml-1">← {vm.name}</span>
                                      {vm.readOnly && <Badge variant="outline" className="ml-1 text-[9px] py-0 h-3.5">RO</Badge>}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={pod}
            apiUrl={`/api/clusters/${clusterId}/resources/${namespace}/pods/${podName}`}
            onSaved={() => mutate()}
            portForwardContext={{
              clusterId: decodedClusterId,
              namespace,
              resourceType: 'pod',
              resourceName: podName,
            }}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete ${podName}?`} description={`This will delete the pod "${podName}". If managed by a controller, it will be recreated.`} confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={deleting} />
      <ResourceDiffDialog open={compareOpen} onOpenChange={setCompareOpen} sourceClusterId={clusterId} sourceNamespace={namespace} resourceType="pods" resourceName={podName} sourceResource={pod} />

      <PodDebugDialog
        open={debugOpen}
        onOpenChange={setDebugOpen}
        clusterId={decodedClusterId}
        namespace={namespace}
        podName={podName}
        containers={containers.map((c: any) => c.name)}
      />

      {/* Env Variables Drawer */}
      <Sheet open={envDrawerOpen} onOpenChange={setEnvDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-base">Environment Variables — {podName}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6 overflow-x-hidden">
            {containers.map((ctr: any, idx: number) => {
              return (
                <div key={idx} className="space-y-1">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{ctr.name}</h3>
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '65%' }} />
                      </colgroup>
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Name</th>
                          <th className="px-3 py-1.5 text-left font-medium">Value / Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ctr.env || []).map((env: any, ei: number) => (
                          <tr key={ei} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-1 font-mono font-medium text-blue-600 dark:text-blue-400 truncate" title={env.name}>{env.name}</td>
                            <td className="px-3 py-1 font-mono overflow-hidden">
                              <div className="break-all">
                                <EnvValueCell env={env} clusterId={decodedClusterId} namespace={namespace} />
                              </div>
                            </td>
                          </tr>
                        ))}
                        <EnvFromRows envFrom={ctr.envFrom || []} clusterId={decodedClusterId} namespace={namespace} />
                        <MountedSecretRows volumes={spec.volumes || []} volumeMounts={ctr.volumeMounts || []} clusterId={decodedClusterId} namespace={namespace} />
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Linked Secrets & ConfigMaps */}
            <PodLinkedSecrets podSpec={spec} clusterId={decodedClusterId} namespace={namespace} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
