'use client';

import dynamic from 'next/dynamic';

const ChartLoading = () => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="rounded-lg border bg-card p-4">
        <div className="h-4 w-24 bg-muted rounded animate-pulse mb-4" />
        <div className="h-[120px] bg-muted/50 rounded animate-pulse" />
      </div>
    ))}
  </div>
);

export const PodMetricsCharts = dynamic(
  () => import('./metrics-charts-impl').then((mod) => ({ default: mod.PodMetricsCharts })),
  { ssr: false, loading: ChartLoading }
);

export const NodeMetricsSummary = dynamic(
  () => import('./metrics-charts-impl').then((mod) => ({ default: mod.NodeMetricsSummary })),
  { ssr: false, loading: ChartLoading }
);
