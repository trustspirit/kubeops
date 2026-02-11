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
import { ArrowLeft, Terminal, ScrollText } from 'lucide-react';
import * as yaml from 'js-yaml';
import { usePanelStore } from '@/stores/panel-store';
import { YamlEditor } from '@/components/shared/yaml-editor';
import { PodMetricsCharts } from '@/components/shared/metrics-charts';

export default function PodDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const podName = params.podName as string;

  const { addTab } = usePanelStore();
  const { data: pod, error, isLoading, mutate } = useResourceDetail({
    clusterId: decodeURIComponent(clusterId),
    namespace,
    resourceType: 'pods',
    name: podName,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => mutate()} />;
  if (!pod) return null;

  const metadata = pod.metadata || {};
  const spec = pod.spec || {};
  const status = pod.status || {};
  const containers = spec.containers || [];
  const containerStatuses = status.containerStatuses || [];
  const labels = metadata.labels || {};
  const phase = metadata.deletionTimestamp ? 'Terminating' : status.phase || 'Unknown';

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
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="containers">Containers ({containers.length})</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <PodMetricsCharts
            clusterId={decodeURIComponent(clusterId)}
            namespace={namespace}
            podName={podName}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Pod Info</h3>
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Node</span><span className="font-mono">{spec.nodeName || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span className="font-mono">{status.podIP || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Host IP</span><span className="font-mono">{status.hostIP || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">QoS</span><span>{status.qosClass || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Restart Policy</span><span>{spec.restartPolicy || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service Account</span><span className="font-mono">{spec.serviceAccountName || '-'}</span></div>
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

          {(status.conditions || []).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Conditions</h3>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Reason</th>
                      <th className="px-3 py-2 text-left font-medium">Last Transition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(status.conditions || []).map((c: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{c.type}</td>
                        <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                        <td className="px-3 py-2 text-muted-foreground">{c.reason || '-'}</td>
                        <td className="px-3 py-2"><AgeDisplay timestamp={c.lastTransitionTime} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="containers" className="space-y-4 mt-4">
          {containers.map((container: any, idx: number) => {
            const cs = containerStatuses.find((s: any) => s.name === container.name);
            const stateKey = cs?.state ? Object.keys(cs.state)[0] : 'unknown';
            return (
              <div key={idx} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{container.name}</h4>
                    <StatusBadge status={stateKey === 'running' ? 'Running' : stateKey === 'waiting' ? 'Pending' : stateKey === 'terminated' ? 'Failed' : 'Unknown'} />
                  </div>
                  {cs && <span className="text-xs text-muted-foreground">Restarts: {cs.restartCount || 0}</span>}
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Image</span><span className="font-mono text-xs break-all">{container.image}</span></div>
                  {container.ports && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ports</span>
                      <span>{container.ports.map((p: any) => `${p.containerPort}/${p.protocol || 'TCP'}`).join(', ')}</span>
                    </div>
                  )}
                  {container.resources?.requests && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Requests</span>
                      <span className="text-xs">CPU: {container.resources.requests.cpu || '-'}, Mem: {container.resources.requests.memory || '-'}</span>
                    </div>
                  )}
                  {container.resources?.limits && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Limits</span>
                      <span className="text-xs">CPU: {container.resources.limits.cpu || '-'}, Mem: {container.resources.limits.memory || '-'}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <YamlEditor
            data={pod}
            apiUrl={`/api/clusters/${clusterId}/resources/${namespace}/pods/${podName}`}
            onSaved={() => mutate()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
