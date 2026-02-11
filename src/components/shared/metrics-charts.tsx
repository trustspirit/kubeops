'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Cpu, MemoryStick, Network, HardDrive } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

interface MetricsPoint {
  time: string;
  cpu: number;    // millicores
  memory: number; // MiB
  netRx?: number; // KB/s
  netTx?: number; // KB/s
  fsRead?: number;  // KB/s
  fsWrite?: number; // KB/s
}

function parseCpu(val: string): number {
  if (!val) return 0;
  if (val.endsWith('n')) return parseInt(val) / 1_000_000;
  if (val.endsWith('u')) return parseInt(val) / 1_000;
  if (val.endsWith('m')) return parseInt(val);
  return parseFloat(val) * 1000;
}

function parseMemory(val: string): number {
  if (!val) return 0;
  if (val.endsWith('Ki')) return parseInt(val) / 1024;
  if (val.endsWith('Mi')) return parseInt(val);
  if (val.endsWith('Gi')) return parseInt(val) * 1024;
  if (val.endsWith('k')) return parseInt(val) / 1024;
  if (val.endsWith('M')) return parseInt(val);
  if (val.endsWith('G')) return parseInt(val) * 1024;
  return parseInt(val) / (1024 * 1024); // bytes to MiB
}

function formatCpu(val: number): string {
  if (val >= 1000) return `${(val / 1000).toFixed(1)} cores`;
  return `${Math.round(val)}m`;
}

function formatMemory(val: number): string {
  if (val >= 1024) return `${(val / 1024).toFixed(1)} GiB`;
  return `${Math.round(val)} MiB`;
}

function formatNetRate(val: number): string {
  if (val >= 1024) return `${(val / 1024).toFixed(1)} MB/s`;
  return `${Math.round(val)} KB/s`;
}

function MetricTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((p: any) => {
        let text = '';
        if (p.dataKey === 'cpu') text = `CPU: ${formatCpu(p.value)}`;
        else if (p.dataKey === 'memory') text = `Memory: ${formatMemory(p.value)}`;
        else if (p.dataKey === 'netRx') text = `Rx: ${formatNetRate(p.value)}`;
        else if (p.dataKey === 'netTx') text = `Tx: ${formatNetRate(p.value)}`;
        else if (p.dataKey === 'fsRead') text = `Read: ${formatNetRate(p.value)}`;
        else if (p.dataKey === 'fsWrite') text = `Write: ${formatNetRate(p.value)}`;
        else text = `${p.dataKey}: ${p.value}`;
        return <p key={p.dataKey} style={{ color: p.color }}>{text}</p>;
      })}
    </div>
  );
}

// === Pod Metrics ===
interface PodMetricsProps {
  clusterId: string;
  namespace: string;
  podName: string;
  nodeName?: string;
}

export function PodMetricsCharts({ clusterId, namespace, podName, nodeName }: PodMetricsProps) {
  const historyRef = useRef<MetricsPoint[]>([]);
  const prevNetRef = useRef<{ rx: number; tx: number; ts: number } | null>(null);
  const prevFsRef = useRef<{ read: number; write: number; ts: number } | null>(null);
  const [history, setHistory] = useState<MetricsPoint[]>([]);

  const { data } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/metrics?type=pods&namespace=${namespace}&name=${podName}`,
    { refreshInterval: 5000 }
  );

  // Prometheus for network & filesystem I/O (with node fallback)
  const { data: promData, error: promError } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/metrics?type=prometheus&namespace=${namespace}&name=${podName}${nodeName ? `&node=${nodeName}` : ''}`,
    { refreshInterval: 5000, revalidateOnFocus: false }
  );
  const promUnavailable = promError?.status === 404;

  useEffect(() => {
    if (!data?.containers) return;
    const containers = data.containers || [];
    let totalCpu = 0;
    let totalMem = 0;
    containers.forEach((c: any) => {
      totalCpu += parseCpu(c.usage?.cpu || '0');
      totalMem += parseMemory(c.usage?.memory || '0');
    });

    // Network & FS rate from Prometheus (cumulative counters → rate)
    let netRx = 0, netTx = 0, fsRead = 0, fsWrite = 0;
    if (promData && !promData.error) {
      const rxBytes = promData.netRxBytes || 0;
      const txBytes = promData.netTxBytes || 0;
      const now = Date.now();
      if (prevNetRef.current) {
        const dt = (now - prevNetRef.current.ts) / 1000;
        if (dt > 0) {
          netRx = Math.max(0, (rxBytes - prevNetRef.current.rx) / 1024 / dt);
          netTx = Math.max(0, (txBytes - prevNetRef.current.tx) / 1024 / dt);
        }
      }
      prevNetRef.current = { rx: rxBytes, tx: txBytes, ts: now };

      const readB = promData.fsReadBytes || 0;
      const writeB = promData.fsWriteBytes || 0;
      if (prevFsRef.current) {
        const dt = (now - prevFsRef.current.ts) / 1000;
        if (dt > 0) {
          fsRead = Math.max(0, (readB - prevFsRef.current.read) / 1024 / dt);
          fsWrite = Math.max(0, (writeB - prevFsRef.current.write) / 1024 / dt);
        }
      }
      prevFsRef.current = { read: readB, write: writeB, ts: now };
    }

    const now = new Date();
    const point: MetricsPoint = {
      time: now.toLocaleTimeString('en', { hour12: false, minute: '2-digit', second: '2-digit' }),
      cpu: Math.round(totalCpu * 10) / 10,
      memory: Math.round(totalMem * 10) / 10,
      netRx: Math.round(netRx * 10) / 10,
      netTx: Math.round(netTx * 10) / 10,
      fsRead: Math.round(fsRead * 10) / 10,
      fsWrite: Math.round(fsWrite * 10) / 10,
    };

    const h = [...historyRef.current, point].slice(-60); // Keep 5 min at 5s interval
    historyRef.current = h;
    setHistory(h);
  }, [data, promData]);

  if (history.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[{ icon: Cpu, label: 'CPU Usage', color: 'text-blue-500' }, { icon: MemoryStick, label: 'Memory Usage', color: 'text-purple-500' }, { icon: Network, label: 'Network I/O', color: 'text-emerald-500' }, { icon: HardDrive, label: 'Filesystem I/O', color: 'text-cyan-500' }].map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <m.icon className={`h-4 w-4 ${m.color}`} />{m.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 flex items-center justify-center h-[120px] text-xs text-muted-foreground">
              Waiting for metrics...
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const latest = history[history.length - 1];
  const latestCpu = latest?.cpu || 0;
  const latestMem = latest?.memory || 0;
  const latestRx = latest?.netRx || 0;
  const latestTx = latest?.netTx || 0;
  const hasNetData = history.some(h => (h.netRx || 0) > 0 || (h.netTx || 0) > 0);
  const hasFsData = history.some(h => (h.fsRead || 0) > 0 || (h.fsWrite || 0) > 0);
  const latestFsRead = latest?.fsRead || 0;
  const latestFsWrite = latest?.fsWrite || 0;

  // After 12+ data points (~1 min) with promData loaded, if still 0 → metric doesn't exist
  const promLoaded = !!promData && !promError;
  const enoughSamples = history.length >= 12;
  const netUnavailable = promUnavailable || (promLoaded && enoughSamples && !hasNetData);
  const fsUnavailable = promUnavailable || (promLoaded && enoughSamples && !hasFsData);

  const chartCount = 2 + (netUnavailable ? 0 : 1) + (fsUnavailable ? 0 : 1);

  return (
    <div className={cn('grid gap-4', chartCount <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4')}>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-500" />
              CPU Usage
            </div>
            <span className="text-base font-bold text-blue-500">{formatCpu(latestCpu)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCpu(v)} width={45} />
              <Tooltip content={<MetricTooltip />} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={1.5} fill="url(#cpuGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-purple-500" />
              Memory Usage
            </div>
            <span className="text-base font-bold text-purple-500">{formatMemory(latestMem)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
              <defs>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatMemory(v)} width={55} />
              <Tooltip content={<MetricTooltip />} />
              <Area type="monotone" dataKey="memory" stroke="#a855f7" strokeWidth={1.5} fill="url(#memGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Network I/O */}
      {!netUnavailable && <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-emerald-500" />
              Network I/O
            </div>
            {hasNetData ? (
              <span className="text-xs text-muted-foreground">
                <span className="text-emerald-500 font-medium">Rx {formatNetRate(latestRx)}</span>
                {' / '}
                <span className="text-orange-500 font-medium">Tx {formatNetRate(latestTx)}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Collecting...</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {hasNetData ? (
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNetRate(v)} width={55} />
                <Tooltip content={<MetricTooltip />} />
                <Area type="monotone" dataKey="netRx" stroke="#10b981" strokeWidth={1.5} fill="url(#rxGrad)" dot={false} name="Rx" />
                <Area type="monotone" dataKey="netTx" stroke="#f97316" strokeWidth={1.5} fill="url(#txGrad)" dot={false} name="Tx" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground">
              {promUnavailable ? 'Prometheus not found' : 'Waiting for network data...'}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Filesystem I/O */}
      {!fsUnavailable && <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-cyan-500" />
              Filesystem I/O
            </div>
            {hasFsData ? (
              <span className="text-xs text-muted-foreground">
                <span className="text-cyan-500 font-medium">R {formatNetRate(latestFsRead)}</span>
                {' / '}
                <span className="text-rose-500 font-medium">W {formatNetRate(latestFsWrite)}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{promUnavailable ? 'No Prometheus' : 'Collecting...'}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {hasFsData ? (
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                <defs>
                  <linearGradient id="fsReadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fsWriteGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNetRate(v)} width={55} />
                <Tooltip content={<MetricTooltip />} />
                <Area type="monotone" dataKey="fsRead" stroke="#06b6d4" strokeWidth={1.5} fill="url(#fsReadGrad)" dot={false} name="Read" />
                <Area type="monotone" dataKey="fsWrite" stroke="#f43f5e" strokeWidth={1.5} fill="url(#fsWriteGrad)" dot={false} name="Write" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground">
              {promUnavailable ? 'Prometheus not found' : 'Waiting for filesystem data...'}
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}

// === Node Metrics Summary for Cluster Overview ===
interface NodeMetricsProps {
  clusterId: string;
}

export function NodeMetricsSummary({ clusterId }: NodeMetricsProps) {
  const { data } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/metrics?type=nodes`,
    { refreshInterval: 15000 }
  );

  if (!data?.items?.length) return null;

  const nodes = data.items.map((n: any) => ({
    name: n.metadata?.name?.split('.')[0] || n.metadata?.name || '',
    cpu: parseCpu(n.usage?.cpu || '0'),
    memory: parseMemory(n.usage?.memory || '0'),
  }));

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium">Node Resource Usage</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={Math.max(120, nodes.length * 28 + 30)}>
          <AreaChart data={nodes} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 5 }}>
            <XAxis type="number" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCpu(v)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'currentColor' }} tickLine={false} axisLine={false} width={80} />
            <Tooltip content={<MetricTooltip />} />
            <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="#3b82f680" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
