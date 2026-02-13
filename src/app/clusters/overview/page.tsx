'use client';

import { useRouter } from 'next/navigation';
import { useClusters } from '@/hooks/use-clusters';
import { useMultiClusterData } from '@/hooks/use-multi-cluster-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ArrowLeft, Box, AlertTriangle, AlertCircle, Server } from 'lucide-react';

export default function MultiClusterOverviewPage() {
  const router = useRouter();
  const { clusters, isLoading: clustersLoading } = useClusters();
  const { clusterData, isLoading: dataLoading } = useMultiClusterData(clusters);

  const isLoading = clustersLoading || dataLoading;

  const totalPods = clusterData.reduce((s, c) => s + c.podCount, 0);
  const totalRunning = clusterData.reduce((s, c) => s + c.runningPods, 0);
  const totalFailing = clusterData.reduce((s, c) => s + c.failingPods, 0);
  const totalWarnings = clusterData.reduce((s, c) => s + c.warningEvents, 0);
  const connectedCount = clusterData.filter((c) => c.status === 'connected').length;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="electron-header-inset flex h-14 items-center justify-between border-b px-4 shrink-0 drag-region">
        <div className="flex items-center gap-3 no-drag-region">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/clusters')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold tracking-tight">Multi-Cluster Overview</h1>
        </div>
        <div className="flex items-center gap-2 no-drag-region">
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-6 p-6">
          {/* Summary Stats */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg p-2.5 bg-blue-500/10">
                  <Server className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{connectedCount}</p>
                  <p className="text-xs text-muted-foreground">Connected Clusters</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg p-2.5 bg-green-500/10">
                  <Box className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalRunning}<span className="text-sm font-normal text-muted-foreground">/{totalPods}</span></p>
                  <p className="text-xs text-muted-foreground">Running Pods</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2.5 ${totalFailing > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                  <AlertCircle className={`h-5 w-5 ${totalFailing > 0 ? 'text-red-500' : 'text-green-500'}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalFailing}</p>
                  <p className="text-xs text-muted-foreground">Failing Pods</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2.5 ${totalWarnings > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
                  <AlertTriangle className={`h-5 w-5 ${totalWarnings > 0 ? 'text-amber-500' : 'text-green-500'}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalWarnings}</p>
                  <p className="text-xs text-muted-foreground">Warning Events (1h)</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cluster Health Grid */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Cluster Health</h2>
            {isLoading && (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28" />
                ))}
              </div>
            )}
            {!isLoading && clusterData.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No connected clusters found. Go back to connect clusters.
              </div>
            )}
            {!isLoading && clusterData.length > 0 && (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {clusterData.map((cluster) => {
                  const hasIssues = cluster.failingPods > 0 || cluster.warningEvents > 0;
                  return (
                    <Card
                      key={cluster.name}
                      className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/50"
                      onClick={() => router.push(`/clusters/${encodeURIComponent(cluster.name)}`)}
                    >
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            cluster.status === 'connected'
                              ? hasIssues ? 'bg-amber-500' : 'bg-green-500'
                              : 'bg-red-500'
                          }`} />
                          <CardTitle className="text-sm font-medium truncate">{cluster.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {cluster.error ? (
                          <p className="text-xs text-destructive">{cluster.error}</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-lg font-bold">{cluster.runningPods}<span className="text-xs font-normal text-muted-foreground">/{cluster.podCount}</span></p>
                              <p className="text-[10px] text-muted-foreground">Pods</p>
                            </div>
                            <div>
                              <p className={`text-lg font-bold ${cluster.failingPods > 0 ? 'text-red-500' : ''}`}>{cluster.failingPods}</p>
                              <p className="text-[10px] text-muted-foreground">Failing</p>
                            </div>
                            <div>
                              <p className={`text-lg font-bold ${cluster.warningEvents > 0 ? 'text-amber-500' : ''}`}>{cluster.warningEvents}</p>
                              <p className="text-[10px] text-muted-foreground">Warnings</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Aggregated Failing Pods */}
          {totalFailing > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Failing Pods Breakdown
              </h2>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Cluster</th>
                      <th className="px-4 py-2 text-left font-medium">Failing Pods</th>
                      <th className="px-4 py-2 text-left font-medium">Total Pods</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterData
                      .filter((c) => c.failingPods > 0)
                      .sort((a, b) => b.failingPods - a.failingPods)
                      .map((c) => (
                        <tr key={c.name} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <button
                              onClick={() => router.push(`/clusters/${encodeURIComponent(c.name)}`)}
                              className="text-primary hover:underline font-medium"
                            >
                              {c.name}
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="destructive">{c.failingPods}</Badge>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{c.podCount}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Aggregated Warning Events */}
          {totalWarnings > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Warning Events Breakdown
              </h2>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Cluster</th>
                      <th className="px-4 py-2 text-left font-medium">Warnings (1h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusterData
                      .filter((c) => c.warningEvents > 0)
                      .sort((a, b) => b.warningEvents - a.warningEvents)
                      .map((c) => (
                        <tr key={c.name} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <button
                              onClick={() => router.push(`/clusters/${encodeURIComponent(c.name)}`)}
                              className="text-primary hover:underline font-medium"
                            >
                              {c.name}
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                              {c.warningEvents}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
