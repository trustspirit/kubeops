'use client';

import { useState } from 'react';
import { useClusters } from '@/hooks/use-clusters';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';

export default function ClustersPage() {
  const { clusters, isLoading, error } = useClusters();
  const [search, setSearch] = useState('');

  const filtered = clusters.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.server?.toLowerCase().includes(q) ?? false) ||
      c.cluster.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Clusters</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a cluster to manage. Contexts are loaded from your kubeconfig.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
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

      {!isLoading && clusters.length > 0 && (
        <>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clusters..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filtered.length} of {clusters.length} clusters
            </span>
          </div>

          <div className="flex flex-col rounded-md border divide-y">
            {filtered.map((cluster) => (
              <Link
                key={cluster.name}
                href={`/clusters/${encodeURIComponent(cluster.name)}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors group"
              >
                <div
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    cluster.status === 'connected'
                      ? 'bg-green-500'
                      : cluster.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-medium truncate">{cluster.name}</span>
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
                  <div className="flex items-center gap-2 mt-0.5">
                    {cluster.server && (
                      <span className="text-xs text-muted-foreground truncate">
                        {cluster.server}
                      </span>
                    )}
                    {cluster.error && (
                      <span className="text-xs text-destructive truncate">
                        {cluster.error}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No clusters matching &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
