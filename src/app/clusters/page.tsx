'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useClusters } from '@/hooks/use-clusters';
import { useSettingsStore } from '@/stores/settings-store';
import { useClusterCatalogStore } from '@/stores/cluster-catalog-store';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Server, ArrowRight, Search, Settings, RotateCw, LogIn, Loader2, CircleCheck, LayoutGrid, List, Star, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UpdateIndicator } from '@/components/layout/header';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { ClusterCard } from '@/components/clusters/cluster-card';
import { ClusterTagEditor } from '@/components/clusters/cluster-tag-editor';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function parseClusterName(contextName: string, clusterField: string) {
  const prefix = clusterField + '-';
  if (contextName.startsWith(prefix) && contextName.length > prefix.length) {
    return { prefix, realName: contextName.slice(prefix.length) };
  }
  return { prefix: '', realName: contextName };
}

export default function ClustersPage() {
  const router = useRouter();
  const { clusters, isLoading, error, mutate } = useClusters();
  const { tshProxyUrl, tshAuthType } = useSettingsStore();
  const { viewMode, setViewMode, showFavoritesOnly, setShowFavoritesOnly, getClusterMeta } = useClusterCatalogStore();
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [kubeLoggingIn, setKubeLoggingIn] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const { data: tshStatus, isLoading: tshLoading, mutate: mutateTshStatus } = useSWR('/api/tsh/status', { refreshInterval: 60_000 });
  const tshLoggedIn = tshStatus?.loggedIn === true;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await mutate();
    } finally {
      setRefreshing(false);
    }
  }, [mutate]);

  const handleTshLogin = useCallback(async () => {
    if (!tshProxyUrl) {
      toast.error('Teleport Proxy URL is not configured. Please set it in Settings.');
      setSettingsOpen(true);
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch('/api/tsh/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'proxy-login',
          proxyUrl: tshProxyUrl,
          authType: tshAuthType || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`tsh login failed: ${data.error}`);
        return;
      }
      toast.success('Teleport login successful');
      await Promise.all([mutate(), mutateTshStatus()]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`tsh login failed: ${message}`);
    } finally {
      setLoggingIn(false);
    }
  }, [tshProxyUrl, tshAuthType, mutate, mutateTshStatus]);

  const handleClusterClick = useCallback(async (contextName: string, clusterField: string, status: string) => {
    if (status === 'connected') {
      router.push(`/clusters/${encodeURIComponent(contextName)}`);
      return;
    }
    const { realName } = parseClusterName(contextName, clusterField);
    setKubeLoggingIn(contextName);
    try {
      const res = await fetch('/api/tsh/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kube-login', cluster: realName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error('tsh kube login failed', { description: `${realName}: ${data.error}` });
        return;
      }
      toast.success('Cluster login successful', { description: realName });
      await mutate();
      router.push(`/clusters/${encodeURIComponent(contextName)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('tsh kube login failed', { description: `${realName}: ${message}` });
    } finally {
      setKubeLoggingIn(null);
    }
  }, [router, mutate]);

  // Filter and group clusters
  const filtered = useMemo(() => {
    let result = clusters.filter((c) => {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.server?.toLowerCase().includes(q) ?? false) ||
        c.cluster.toLowerCase().includes(q)
      );
    });

    if (showFavoritesOnly) {
      result = result.filter((c) => getClusterMeta(c.name).favorite);
    }

    if (tagFilter) {
      result = result.filter((c) => getClusterMeta(c.name).tags.includes(tagFilter));
    }

    return result;
  }, [clusters, search, showFavoritesOnly, tagFilter, getClusterMeta]);

  // Get all unique tags across clusters
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    clusters.forEach((c) => getClusterMeta(c.name).tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [clusters, getClusterMeta]);

  // Group clusters
  const grouped = useMemo(() => {
    const favorites = filtered.filter((c) => getClusterMeta(c.name).favorite);
    const groups = new Map<string, typeof filtered>();

    for (const c of filtered) {
      const meta = getClusterMeta(c.name);
      const group = meta.group || 'Ungrouped';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(c);
    }

    return { favorites, groups };
  }, [filtered, getClusterMeta]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const hasGroups = Array.from(grouped.groups.keys()).some((g) => g !== 'Ungrouped');

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <header className="electron-header-inset flex h-14 items-center justify-between border-b px-4 shrink-0 drag-region">
        <div className="flex items-center gap-3 no-drag-region">
          <h1 className="text-lg font-bold tracking-tight">KubeOps</h1>
        </div>
        <div className="flex items-center gap-2 no-drag-region">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 gap-1.5 ${tshLoggedIn ? 'text-green-500' : ''}`}
                onClick={handleTshLogin}
                disabled={loggingIn || tshLoading}
              >
                {loggingIn || tshLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : tshLoggedIn ? (
                  <CircleCheck className="h-4 w-4" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <span className="text-xs">
                  {tshLoading ? 'TSH' : tshLoggedIn ? tshStatus.username?.split('@')[0] : 'TSH Login'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {tshLoading
                ? 'Checking Teleport status...'
                : tshLoggedIn
                  ? `Logged in as ${tshStatus.username} · ${tshStatus.cluster}`
                  : tshProxyUrl
                    ? `tsh login --proxy=${tshProxyUrl}`
                    : 'Configure Teleport in Settings first'
              }
            </TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={refreshing} title="Refresh cluster list">
            <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <UpdateIndicator />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
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
              {/* Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clusters..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>

                <div className="flex items-center gap-1 border rounded-md overflow-hidden">
                  <button
                    className={cn('px-2 py-1.5 text-xs flex items-center gap-1 transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className={cn('px-2 py-1.5 text-xs flex items-center gap-1 border-l transition-colors', viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                    onClick={() => setViewMode('cards')}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Button
                  variant={showFavoritesOnly ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                >
                  <Star className={cn('h-3.5 w-3.5', showFavoritesOnly && 'fill-current')} />
                  <span className="text-xs">Favorites</span>
                </Button>

                {allTags.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs border transition-colors',
                          tagFilter === tag ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                <span className="text-sm text-muted-foreground ml-auto">
                  {filtered.length} of {clusters.length} clusters
                </span>
              </div>

              {/* Card View */}
              {viewMode === 'cards' ? (
                <div className="space-y-6">
                  {/* Favorites section */}
                  {grouped.favorites.length > 0 && !showFavoritesOnly && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> Favorites
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {grouped.favorites.map((cluster) => (
                          <ClusterCard
                            key={`fav-${cluster.name}`}
                            name={cluster.name}
                            cluster={cluster.cluster}
                            server={cluster.server}
                            status={cluster.status}
                            error={cluster.error}
                            isLogging={kubeLoggingIn === cluster.name}
                            onClick={() => handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                            parseClusterName={parseClusterName}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Grouped sections */}
                  {hasGroups ? (
                    Array.from(grouped.groups.entries()).map(([group, items]) => (
                      <div key={group}>
                        <button
                          onClick={() => toggleGroup(group)}
                          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2 hover:text-foreground transition-colors"
                        >
                          {collapsedGroups.has(group) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {group}
                          <span className="text-xs">({items.length})</span>
                        </button>
                        {!collapsedGroups.has(group) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {items.map((cluster) => (
                              <ClusterCard
                                key={cluster.name}
                                name={cluster.name}
                                cluster={cluster.cluster}
                                server={cluster.server}
                                status={cluster.status}
                                error={cluster.error}
                                isLogging={kubeLoggingIn === cluster.name}
                                onClick={() => handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                                parseClusterName={parseClusterName}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filtered.map((cluster) => (
                        <ClusterCard
                          key={cluster.name}
                          name={cluster.name}
                          cluster={cluster.cluster}
                          server={cluster.server}
                          status={cluster.status}
                          error={cluster.error}
                          isLogging={kubeLoggingIn === cluster.name}
                          onClick={() => handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                          parseClusterName={parseClusterName}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* List View */
                <div className="flex flex-col rounded-md border divide-y">
                  {filtered.map((cluster) => {
                    const isKubeLogging = kubeLoggingIn === cluster.name;
                    const { prefix, realName } = parseClusterName(cluster.name, cluster.cluster);
                    const meta = getClusterMeta(cluster.name);
                    return (
                      <div
                        key={cluster.name}
                        role="button"
                        tabIndex={0}
                        onClick={() => !isKubeLogging && handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                        onKeyDown={(e) => e.key === 'Enter' && !isKubeLogging && handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                        className={`flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer ${isKubeLogging ? 'opacity-60 pointer-events-none' : ''}`}
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
                          <div className="flex items-center gap-2">
                            {meta.favorite && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />}
                            <span className="font-medium truncate">
                              {prefix && <span className="text-muted-foreground">{prefix}</span>}
                              <span className="text-primary">{realName}</span>
                            </span>
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
                            {meta.group && <Badge variant="secondary" className="text-[10px]">{meta.group}</Badge>}
                            {meta.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                            ))}
                            {isKubeLogging && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Logging in...
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {cluster.server && (
                              <span className="text-xs text-muted-foreground truncate">{cluster.server}</span>
                            )}
                            {cluster.error && (
                              <span className="text-xs text-destructive truncate">{cluster.error}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <ClusterTagEditor contextName={cluster.name} />
                          <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No clusters matching &ldquo;{search}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
