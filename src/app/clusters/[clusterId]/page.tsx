'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Server, Box, Layers, Network, AlertTriangle, RefreshCw } from 'lucide-react';
import { useNamespaceStore } from '@/stores/namespace-store';
import Link from 'next/link';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts';
import { NodeMetricsSummary } from '@/components/shared/metrics-charts';

const POD_COLORS: Record<string, string> = {
  Running: '#22c55e',
  Succeeded: '#3b82f6',
  Pending: '#eab308',
  Failed: '#ef4444',
  Unknown: '#71717a',
  Terminating: '#a855f7',
};

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md">
      <span className="font-medium">{d.name}: </span>
      <span>{payload[0].value}</span>
    </div>
  );
}

export default function ClusterOverviewPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);
  const isAllNs = namespace === '_all';
  const nsLabel = isAllNs ? 'All Namespaces' : namespace;

  const { data: health, error: healthError } = useSWR(`/api/clusters/${clusterId}/health`);
  const { data: nodesData } = useSWR(`/api/clusters/${clusterId}/nodes`);
  const { data: podsData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/pods`);
  const { data: deploymentsData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/deployments`);
  const { data: statefulsetData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/statefulsets`);
  const { data: daemonsetData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/daemonsets`);
  const { data: servicesData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/services`);
  const { data: eventsData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/events`);

  if (healthError) return <ErrorDisplay error={healthError} />;

  const nodes = nodesData?.items || [];
  const pods = podsData?.items || [];
  const deployments = deploymentsData?.items || [];
  const statefulsets = statefulsetData?.items || [];
  const daemonsets = daemonsetData?.items || [];
  const services = servicesData?.items || [];
  const events = eventsData?.items || [];

  const readyNodes = nodes.filter((n: any) =>
    n.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True')
  );
  const runningPods = pods.filter((p: any) => p.status?.phase === 'Running');

  // === Data computations ===

  // Pod status
  const podStatusMap: Record<string, number> = {};
  pods.forEach((p: any) => {
    const s = p.metadata?.deletionTimestamp ? 'Terminating' : (p.status?.phase || 'Unknown');
    podStatusMap[s] = (podStatusMap[s] || 0) + 1;
  });
  const podStatusData = Object.entries(podStatusMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Workloads health
  const workloads = [
    { name: 'Deploy', ready: 0, notReady: 0 },
    { name: 'STS', ready: 0, notReady: 0 },
    { name: 'DS', ready: 0, notReady: 0 },
  ];
  deployments.forEach((d: any) => {
    const isReady = (d.status?.readyReplicas || 0) >= (d.spec?.replicas || 1);
    isReady ? workloads[0].ready++ : workloads[0].notReady++;
  });
  statefulsets.forEach((s: any) => {
    const isReady = (s.status?.readyReplicas || 0) >= (s.spec?.replicas || 1);
    isReady ? workloads[1].ready++ : workloads[1].notReady++;
  });
  daemonsets.forEach((d: any) => {
    const isReady = (d.status?.numberReady || 0) >= (d.status?.desiredNumberScheduled || 1);
    isReady ? workloads[2].ready++ : workloads[2].notReady++;
  });
  const workloadData = workloads.filter(w => w.ready + w.notReady > 0);

  // Namespace distribution (all-ns mode)
  const nsDistMap: Record<string, number> = {};
  if (isAllNs) {
    pods.forEach((p: any) => {
      const ns = p.metadata?.namespace || 'unknown';
      nsDistMap[ns] = (nsDistMap[ns] || 0) + 1;
    });
  }
  const nsDistData = Object.entries(nsDistMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Warning events (last hour)
  const oneHourAgo = Date.now() - 3600_000;
  const warningEvents = events.filter((e: any) => {
    if (e.type !== 'Warning') return false;
    const ts = e.lastTimestamp || e.metadata?.creationTimestamp;
    return ts && new Date(ts).getTime() > oneHourAgo;
  });
  const eventReasonMap: Record<string, number> = {};
  warningEvents.forEach((e: any) => {
    const reason = e.reason || 'Unknown';
    eventReasonMap[reason] = (eventReasonMap[reason] || 0) + 1;
  });
  const eventData = Object.entries(eventReasonMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Top restarts
  const restartPods = pods
    .map((p: any) => ({
      name: p.metadata?.name || '',
      ns: p.metadata?.namespace || '',
      restarts: (p.status?.containerStatuses || []).reduce((s: number, c: any) => s + (c.restartCount || 0), 0),
    }))
    .filter((p: any) => p.restarts > 0)
    .sort((a: any, b: any) => b.restarts - a.restarts)
    .slice(0, 5);

  // Stats
  const stats = [
    { label: 'Nodes', value: `${readyNodes.length}/${nodes.length}`, sub: 'Ready', icon: Server, href: `/clusters/${clusterId}/nodes`, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Pods', value: `${runningPods.length}/${pods.length}`, sub: 'Running', icon: Box, href: `/clusters/${clusterId}/namespaces/${namespace}/pods`, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Deployments', value: deployments.length, sub: `${deployments.filter((d: any) => (d.status?.readyReplicas || 0) >= (d.spec?.replicas || 1)).length} ready`, icon: Layers, href: `/clusters/${clusterId}/namespaces/${namespace}/deployments`, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Services', value: services.length, sub: 'total', icon: Network, href: `/clusters/${clusterId}/namespaces/${namespace}/services`, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{decodedClusterId}</h1>
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge status={health?.status === 'connected' ? 'Connected' : 'Error'} />
          <span className="text-sm text-muted-foreground">{nsLabel}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-colors hover:border-primary/50 hover:bg-accent/50 cursor-pointer">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`rounded-lg p-2.5 ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold leading-tight">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.sub}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Pod Status Donut */}
        {pods.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium">Pod Status Distribution</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center">
                <div className="relative">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={podStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {podStatusData.map((entry) => (
                          <Cell key={entry.name} fill={POD_COLORS[entry.name] || '#71717a'} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold">{pods.length}</span>
                    <span className="text-[10px] text-muted-foreground">total</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2 ml-4">
                  {podStatusData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: POD_COLORS[entry.name] || '#71717a' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{entry.name}</p>
                        <p className="text-sm font-semibold">{entry.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workload Health */}
        {workloadData.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium">Workload Health</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={workloadData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="ready" name="Ready" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="notReady" name="Not Ready" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Ready
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Not Ready
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Namespace Distribution (All Namespaces only) */}
        {nsDistData.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium">Pods by Namespace</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={nsDistData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Pods" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Node Metrics */}
        <NodeMetricsSummary clusterId={decodedClusterId} />

        {/* Warning Events + Top Restarts */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Warning events */}
            {eventData.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Warning Events (1h)</p>
                <div className="space-y-1.5">
                  {eventData.map((e) => (
                    <div key={e.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate">{e.name}</span>
                      </div>
                      <span className="font-mono font-medium text-amber-600 dark:text-amber-400 ml-2">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                No warning events in the last hour
              </div>
            )}

            {/* Top restarts */}
            {restartPods.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Top Restarts
                </p>
                <div className="space-y-1.5">
                  {restartPods.map((p) => (
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <span className="truncate block font-mono">{p.name}</span>
                        {isAllNs && <span className="text-muted-foreground">{p.ns}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${Math.min(100, (p.restarts / (restartPods[0]?.restarts || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono font-medium w-8 text-right text-red-600 dark:text-red-400">{p.restarts}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
