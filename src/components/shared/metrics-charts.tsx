'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu, MemoryStick } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

interface MetricsPoint {
  time: string;
  cpu: number;    // millicores
  memory: number; // MiB
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

function MetricTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey === 'cpu' ? `CPU: ${formatCpu(p.value)}` : `Memory: ${formatMemory(p.value)}`}
        </p>
      ))}
    </div>
  );
}

// === Pod Metrics ===
interface PodMetricsProps {
  clusterId: string;
  namespace: string;
  podName: string;
}

export function PodMetricsCharts({ clusterId, namespace, podName }: PodMetricsProps) {
  const historyRef = useRef<MetricsPoint[]>([]);
  const [history, setHistory] = useState<MetricsPoint[]>([]);

  const { data } = useSWR(
    `/api/clusters/${encodeURIComponent(clusterId)}/metrics?type=pods&namespace=${namespace}&name=${podName}`,
    { refreshInterval: 5000 }
  );

  useEffect(() => {
    if (!data?.containers) return;
    const containers = data.containers || [];
    let totalCpu = 0;
    let totalMem = 0;
    containers.forEach((c: any) => {
      totalCpu += parseCpu(c.usage?.cpu || '0');
      totalMem += parseMemory(c.usage?.memory || '0');
    });

    const now = new Date();
    const point: MetricsPoint = {
      time: now.toLocaleTimeString('en', { hour12: false, minute: '2-digit', second: '2-digit' }),
      cpu: Math.round(totalCpu * 10) / 10,
      memory: Math.round(totalMem * 10) / 10,
    };

    const h = [...historyRef.current, point].slice(-60); // Keep 5 min at 5s interval
    historyRef.current = h;
    setHistory(h);
  }, [data]);

  if (history.length === 0) return null;

  const latestCpu = history[history.length - 1]?.cpu || 0;
  const latestMem = history[history.length - 1]?.memory || 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
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
