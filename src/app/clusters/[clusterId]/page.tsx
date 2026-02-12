'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorDisplay } from '@/components/shared/error-display';
import { Server, Box, Layers, Network, AlertTriangle, RefreshCw, Plug, ExternalLink, Globe, Clock, Gauge } from 'lucide-react';
import { useNamespaceStore } from '@/stores/namespace-store';
import Link from 'next/link';
import { PortForwardBtn } from '@/components/shared/port-forward-btn';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis,
  AreaChart, Area,
} from 'recharts';
import { NodeMetricsSummary } from '@/components/shared/metrics-charts';

const POD_COLORS: Record<string, string> = {
  Running: '#22c55e', Succeeded: '#3b82f6', Pending: '#eab308',
  Failed: '#ef4444', Unknown: '#71717a', Terminating: '#a855f7',
};

const AGE_BUCKETS = [
  { label: '< 1h', max: 3600_000, color: '#22c55e' },
  { label: '1h-1d', max: 86400_000, color: '#3b82f6' },
  { label: '1d-7d', max: 604800_000, color: '#8b5cf6' },
  { label: '7d-30d', max: 2592000_000, color: '#f97316' },
  { label: '30d+', max: Infinity, color: '#ef4444' },
];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl">
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.payload?.fill }} />
          <span className="text-muted-foreground">{p.payload?.name || p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function parseCpuForOverview(val: string): number {
  if (!val) return 0;
  if (val.endsWith('n')) return parseInt(val) / 1_000_000;
  if (val.endsWith('u')) return parseInt(val) / 1_000;
  if (val.endsWith('m')) return parseInt(val);
  return parseFloat(val) * 1000;
}

function parseMemoryForOverview(val: string): number {
  if (!val) return 0;
  if (val.endsWith('Ki')) return parseInt(val) / 1024;
  if (val.endsWith('Mi')) return parseInt(val);
  if (val.endsWith('Gi')) return parseInt(val) * 1024;
  if (val.endsWith('k')) return parseInt(val) / 1024;
  if (val.endsWith('M')) return parseInt(val);
  if (val.endsWith('G')) return parseInt(val) * 1024;
  return parseInt(val) / (1024 * 1024);
}

export default function ClusterOverviewPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);
  const isAllNs = namespace === '_all';
  const nsLabel = isAllNs ? 'All Namespaces' : namespace;

  // Core data (always fetch immediately)
  const { data: health, error: healthError } = useSWR(`/api/clusters/${clusterId}/health`);
  const { data: nodesData } = useSWR(`/api/clusters/${clusterId}/nodes`);
  const { data: podsData } = useSWR(`/api/clusters/${clusterId}/resources/${namespace}/pods`);

  // Secondary data (fetch after core data is loaded to reduce initial request burst)
  const coreLoaded = !!health && !!nodesData && !!podsData;
  const { data: deploymentsData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/deployments` : null);
  const { data: statefulsetData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/statefulsets` : null);
  const { data: daemonsetData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/daemonsets` : null);
  const { data: servicesData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/services` : null);
  const { data: ingressData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/ingresses` : null);
  const { data: eventsData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/events` : null);
  const { data: configmapData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/configmaps` : null);
  const { data: secretData } = useSWR(coreLoaded ? `/api/clusters/${clusterId}/resources/${namespace}/secrets` : null);

  if (healthError) return <ErrorDisplay error={healthError} />;

  const nodes = nodesData?.items || [];
  const pods = podsData?.items || [];
  const deployments = deploymentsData?.items || [];
  const statefulsets = statefulsetData?.items || [];
  const daemonsets = daemonsetData?.items || [];
  const services = servicesData?.items || [];
  const ingresses = ingressData?.items || [];
  const events = eventsData?.items || [];
  const configmaps = configmapData?.items || [];
  const secrets = secretData?.items || [];

  const readyNodes = nodes.filter((n: any) => n.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'));
  const runningPods = pods.filter((p: any) => p.status?.phase === 'Running');

  // Pod status
  const podStatusMap: Record<string, number> = {};
  pods.forEach((p: any) => {
    const s = p.metadata?.deletionTimestamp ? 'Terminating' : (p.status?.phase || 'Unknown');
    podStatusMap[s] = (podStatusMap[s] || 0) + 1;
  });
  const podStatusData = Object.entries(podStatusMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Workloads
  const workloads = [{ name: 'Deploy', ready: 0, notReady: 0 }, { name: 'STS', ready: 0, notReady: 0 }, { name: 'DS', ready: 0, notReady: 0 }];
  deployments.forEach((d: any) => { (d.status?.readyReplicas || 0) >= (d.spec?.replicas || 1) ? workloads[0].ready++ : workloads[0].notReady++; });
  statefulsets.forEach((s: any) => { (s.status?.readyReplicas || 0) >= (s.spec?.replicas || 1) ? workloads[1].ready++ : workloads[1].notReady++; });
  daemonsets.forEach((d: any) => { (d.status?.numberReady || 0) >= (d.status?.desiredNumberScheduled || 1) ? workloads[2].ready++ : workloads[2].notReady++; });
  const workloadData = workloads.filter(w => w.ready + w.notReady > 0);

  // NS distribution
  const nsDistMap: Record<string, number> = {};
  if (isAllNs) pods.forEach((p: any) => { const ns = p.metadata?.namespace || '?'; nsDistMap[ns] = (nsDistMap[ns] || 0) + 1; });
  const nsDistData = Object.entries(nsDistMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

  // Warning events (1h)
  const oneHourAgo = Date.now() - 3600_000;
  const warningEvents = events.filter((e: any) => e.type === 'Warning' && new Date(e.lastTimestamp || e.metadata?.creationTimestamp).getTime() > oneHourAgo);
  const eventReasonMap: Record<string, number> = {};
  warningEvents.forEach((e: any) => { eventReasonMap[e.reason || 'Unknown'] = (eventReasonMap[e.reason || 'Unknown'] || 0) + 1; });
  const eventData = Object.entries(eventReasonMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  // Warning event trend (5-min buckets over last hour)
  const eventTrendData: { time: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const bucketStart = oneHourAgo + (11 - i) * 300_000;
    const bucketEnd = bucketStart + 300_000;
    const count = warningEvents.filter((e: any) => {
      const t = new Date(e.lastTimestamp || e.metadata?.creationTimestamp).getTime();
      return t >= bucketStart && t < bucketEnd;
    }).length;
    const mins = Math.round((Date.now() - bucketStart) / 60_000);
    eventTrendData.push({ time: mins <= 0 ? 'now' : `-${mins}m`, count });
  }

  // Pod age distribution
  const now = Date.now();
  const ageBucketCounts = AGE_BUCKETS.map(b => ({ name: b.label, value: 0, fill: b.color }));
  pods.forEach((p: any) => {
    const created = new Date(p.metadata?.creationTimestamp).getTime();
    const age = now - created;
    let prev = 0;
    for (let i = 0; i < AGE_BUCKETS.length; i++) {
      if (age >= prev && age < AGE_BUCKETS[i].max) { ageBucketCounts[i].value++; break; }
      prev = AGE_BUCKETS[i].max;
    }
  });
  const podAgeData = ageBucketCounts.filter(b => b.value > 0 || pods.length > 0);

  // Resource allocation (CPU & Memory requests/limits vs allocatable)
  let totalAllocatableCpu = 0;
  let totalAllocatableMemory = 0;
  nodes.forEach((n: any) => {
    totalAllocatableCpu += parseCpuForOverview(n.status?.allocatable?.cpu || '0');
    totalAllocatableMemory += parseMemoryForOverview(n.status?.allocatable?.memory || '0');
  });
  let totalRequestsCpu = 0, totalLimitsCpu = 0;
  let totalRequestsMemory = 0, totalLimitsMemory = 0;
  pods.forEach((p: any) => {
    (p.spec?.containers || []).forEach((c: any) => {
      totalRequestsCpu += parseCpuForOverview(c.resources?.requests?.cpu || '0');
      totalLimitsCpu += parseCpuForOverview(c.resources?.limits?.cpu || '0');
      totalRequestsMemory += parseMemoryForOverview(c.resources?.requests?.memory || '0');
      totalLimitsMemory += parseMemoryForOverview(c.resources?.limits?.memory || '0');
    });
  });

  // Restarts
  const restartPods = pods.map((p: any) => ({
    name: p.metadata?.name || '', ns: p.metadata?.namespace || '',
    restarts: (p.status?.containerStatuses || []).reduce((s: number, c: any) => s + (c.restartCount || 0), 0),
  })).filter((p: any) => p.restarts > 0).sort((a: any, b: any) => b.restarts - a.restarts).slice(0, 5);

  // Services with ports
  const svcWithPorts = services.filter((s: any) => s.spec?.ports?.length > 0).slice(0, 12);

  // Ingresses
  const ingressHosts = ingresses.flatMap((ing: any) =>
    (ing.spec?.rules || []).map((r: any) => ({
      host: r.host || '*',
      paths: (r.http?.paths || []).map((p: any) => p.path || '/').join(', '),
      ingressName: ing.metadata?.name,
      ns: ing.metadata?.namespace,
    }))
  ).slice(0, 8);

  const stats = [
    { label: 'Nodes', value: `${readyNodes.length}/${nodes.length}`, sub: 'Ready', icon: Server, href: `/clusters/${clusterId}/nodes`, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Pods', value: `${runningPods.length}/${pods.length}`, sub: 'Running', icon: Box, href: `/clusters/${clusterId}/namespaces/${namespace}/pods`, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Deployments', value: deployments.length, sub: `${workloads[0].ready} ready`, icon: Layers, href: `/clusters/${clusterId}/namespaces/${namespace}/deployments`, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Services', value: services.length, sub: `${ingresses.length} ingress`, icon: Network, href: `/clusters/${clusterId}/namespaces/${namespace}/services`, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ];

  const cpuReqPct = totalAllocatableCpu > 0 ? Math.round((totalRequestsCpu / totalAllocatableCpu) * 100) : 0;
  const cpuLimPct = totalAllocatableCpu > 0 ? Math.round((totalLimitsCpu / totalAllocatableCpu) * 100) : 0;
  const memReqPct = totalAllocatableMemory > 0 ? Math.round((totalRequestsMemory / totalAllocatableMemory) * 100) : 0;
  const memLimPct = totalAllocatableMemory > 0 ? Math.round((totalLimitsMemory / totalAllocatableMemory) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{decodedClusterId}</h1>
        <div className="flex items-center gap-2 mt-1">
          <StatusBadge status={health?.status === 'connected' ? 'Connected' : 'Error'} />
          <span className="text-sm text-muted-foreground">{nsLabel}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {configmaps.length} ConfigMaps / {secrets.length} Secrets
          </span>
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
                  <div className={`rounded-lg p-2.5 ${stat.bg}`}><Icon className={`h-5 w-5 ${stat.color}`} /></div>
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

      {/* Charts + Info — Row 1: Pod Status | Workload Health */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pod Status Donut */}
        {podStatusData.length > 0 && (
          <Card>
            <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Pod Status</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-center">
                <div className="relative">
                  <ResponsiveContainer width={170} height={170}>
                    <PieChart>
                      <Pie
                        data={podStatusData}
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={78}
                        paddingAngle={4}
                        cornerRadius={4}
                        dataKey="value"
                        strokeWidth={0}
                        animationDuration={800}
                        animationEasing="ease-out"
                      >
                        {podStatusData.map((e) => <Cell key={e.name} fill={POD_COLORS[e.name] || '#71717a'} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold">{pods.length}</span>
                    <span className="text-[10px] text-muted-foreground">total</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2 ml-4">
                  {podStatusData.map((e) => (
                    <div key={e.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: POD_COLORS[e.name] || '#71717a' }} />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{e.name}</p>
                        <p className="text-sm font-semibold">{e.value} <span className="text-[10px] font-normal text-muted-foreground">({pods.length > 0 ? Math.round((e.value / pods.length) * 100) : 0}%)</span></p>
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
            <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Workload Health</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={workloadData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <defs>
                    <linearGradient id="readyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="notReadyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="ready" name="Ready" stackId="a" fill="url(#readyGrad)" animationDuration={600} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="notReady" name="Not Ready" stackId="a" fill="url(#notReadyGrad)" animationDuration={600} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Ready</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Not Ready</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Row 2: Pod Age Distribution | Resource Allocation */}
        {/* Pod Age Distribution */}
        {pods.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-500" />
                Pod Age Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={podAgeData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  {podAgeData.map((_, i) => (
                    <Bar key={i} dataKey="value" name="Pods" animationDuration={600} radius={[6, 6, 0, 0]}>
                      {podAgeData.map((entry, j) => <Cell key={j} fill={entry.fill} />)}
                    </Bar>
                  )).slice(0, 1)}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
                {AGE_BUCKETS.map(b => (
                  <div key={b.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: b.color }} />
                    {b.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resource Allocation */}
        {nodes.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4 text-emerald-500" />
                Resource Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* CPU */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium">CPU</span>
                  <span className="text-muted-foreground">
                    {Math.round(totalRequestsCpu)}m req / {Math.round(totalLimitsCpu)}m lim / {Math.round(totalAllocatableCpu)}m alloc
                  </span>
                </div>
                <div className="relative h-5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, cpuLimPct)}%`,
                      background: cpuLimPct > 100 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #86efac, #22c55e)',
                      opacity: 0.4,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, cpuReqPct)}%`,
                      background: cpuReqPct > 100 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #22c55e, #16a34a)',
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold mix-blend-difference text-white">
                    {cpuReqPct}% requests
                  </div>
                </div>
                {cpuLimPct > 100 && <p className="text-[10px] text-red-500 mt-0.5 font-medium">Overcommitted: limits exceed allocatable ({cpuLimPct}%)</p>}
              </div>
              {/* Memory */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium">Memory</span>
                  <span className="text-muted-foreground">
                    {totalRequestsMemory >= 1024 ? `${(totalRequestsMemory / 1024).toFixed(1)}Gi` : `${Math.round(totalRequestsMemory)}Mi`} req / {totalLimitsMemory >= 1024 ? `${(totalLimitsMemory / 1024).toFixed(1)}Gi` : `${Math.round(totalLimitsMemory)}Mi`} lim / {totalAllocatableMemory >= 1024 ? `${(totalAllocatableMemory / 1024).toFixed(1)}Gi` : `${Math.round(totalAllocatableMemory)}Mi`} alloc
                  </span>
                </div>
                <div className="relative h-5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, memLimPct)}%`,
                      background: memLimPct > 100 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #c4b5fd, #8b5cf6)',
                      opacity: 0.4,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, memReqPct)}%`,
                      background: memReqPct > 100 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'linear-gradient(90deg, #8b5cf6, #7c3aed)',
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold mix-blend-difference text-white">
                    {memReqPct}% requests
                  </div>
                </div>
                {memLimPct > 100 && <p className="text-[10px] text-red-500 mt-0.5 font-medium">Overcommitted: limits exceed allocatable ({memLimPct}%)</p>}
              </div>
              <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-green-500" /> Requests</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-green-500/40" /> Limits</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Row 3: Node Metrics | Warning Event Trend or NS distribution */}
        {/* Node Metrics */}
        <NodeMetricsSummary clusterId={decodedClusterId} />

        {/* Warning Event Trend */}
        {warningEvents.length > 0 ? (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Warning Event Trend <span className="text-[10px] font-normal text-muted-foreground">(1h, 5-min buckets)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={eventTrendData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <defs>
                    <linearGradient id="warnGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name="Events" stroke="#f59e0b" strokeWidth={2} fill="url(#warnGrad)" animationDuration={600} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : nsDistData.length > 0 ? (
          <Card>
            <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Pods by Namespace</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={nsDistData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <defs>
                    <linearGradient id="nsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Pods" fill="url(#nsGrad)" radius={[6, 6, 0, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}

        {/* Row 4: Services & Port Forward | Ingress Endpoints */}
        {/* Services & Port Forward */}
        {svcWithPorts.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Plug className="h-4 w-4 text-blue-500" />
                Services & Port Forward
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="space-y-2 max-h-[220px] overflow-auto">
                {svcWithPorts.map((svc: any) => {
                  const svcName = svc.metadata?.name;
                  const svcNs = svc.metadata?.namespace || namespace;
                  const svcType = svc.spec?.type || 'ClusterIP';
                  const ports = svc.spec?.ports || [];
                  return (
                    <div key={svc.metadata?.uid || svcName} className="flex items-start justify-between gap-2 text-xs border-b last:border-0 pb-2 last:pb-0">
                      <div className="min-w-0">
                        <Link
                          href={`/clusters/${clusterId}/namespaces/${svcNs}/services/${svcName}`}
                          className="font-medium text-primary hover:underline truncate block"
                        >
                          {svcName}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px] py-0 h-4">{svcType}</Badge>
                          {isAllNs && <span className="text-muted-foreground">{svcNs}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {ports.map((p: any) => (
                          <div key={p.port} className="flex items-center gap-1.5">
                            <span className="font-mono text-muted-foreground">{p.port}/{p.protocol || 'TCP'}</span>
                            <PortForwardBtn
                              clusterId={decodedClusterId}
                              namespace={svcNs}
                              resourceType="svc"
                              resourceName={svcName}
                              port={p.port}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ingress Endpoints */}
        {ingressHosts.length > 0 && (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-500" />
                Ingress Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="space-y-2">
                {ingressHosts.map((ih: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <a href={`https://${ih.host}`} target="_blank" rel="noopener"
                        className="font-medium text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="h-3 w-3 shrink-0" />{ih.host}
                      </a>
                      <span className="text-muted-foreground">{ih.paths}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0">{ih.ingressName}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* NS distribution (show if warning events exist — otherwise it was shown above) */}
        {warningEvents.length > 0 && nsDistData.length > 0 && (
          <Card>
            <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Pods by Namespace</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={nsDistData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <defs>
                    <linearGradient id="nsGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Pods" fill="url(#nsGrad2)" radius={[6, 6, 0, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Alerts: Events + Restarts */}
        <Card className={!warningEvents.length && !restartPods.length ? 'lg:col-span-2' : ''}>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-4">
            {eventData.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Warning Events (1h)</p>
                <div className="space-y-1.5">
                  {eventData.map((e) => (
                    <div key={e.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-amber-500" /><span>{e.name}</span></div>
                      <span className="font-mono font-medium text-amber-600 dark:text-amber-400">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="h-1.5 w-1.5 rounded-full bg-green-500" />No warnings in the last hour</div>
            )}
            {restartPods.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5"><RefreshCw className="h-3 w-3" />Top Restarts</p>
                <div className="space-y-1.5">
                  {restartPods.map((p: any) => (
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 min-w-0"><span className="truncate block font-mono">{p.name}</span>{isAllNs && <span className="text-muted-foreground">{p.ns}</span>}</div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, (p.restarts / (restartPods[0]?.restarts || 1)) * 100)}%` }} /></div>
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
