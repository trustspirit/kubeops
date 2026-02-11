'use client';

import { useClusters } from '@/hooks/use-clusters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ClustersPage() {
  const { clusters, isLoading, error } = useClusters();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Clusters</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a cluster to manage. Contexts are loaded from your kubeconfig.
        </p>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load clusters: {error.message}
        </div>
      )}

      {!isLoading && clusters.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
          <Server className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">No clusters found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Make sure you have a valid kubeconfig file at ~/.kube/config
            </p>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              tsh kube login &lt;cluster-name&gt;
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clusters.map((cluster) => (
          <Link
            key={cluster.name}
            href={`/clusters/${encodeURIComponent(cluster.name)}`}
          >
            <Card className="transition-colors hover:border-primary/50 hover:bg-accent/50 cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium truncate">
                  {cluster.name}
                </CardTitle>
                <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      cluster.status === 'connected'
                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                        : cluster.status === 'error'
                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                        : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                    }
                  >
                    {cluster.status}
                  </Badge>
                </div>
                {cluster.server && (
                  <p className="text-xs text-muted-foreground truncate">
                    {cluster.server}
                  </p>
                )}
                {cluster.error && (
                  <p className="text-xs text-destructive truncate">
                    {cluster.error}
                  </p>
                )}
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>Cluster: {cluster.cluster}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
