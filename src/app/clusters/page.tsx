'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useClusters } from '@/hooks/use-clusters';
import { useClustersFiltering } from '@/hooks/use-clusters-filtering';
import { useSettingsStore } from '@/stores/settings-store';
import { useClusterCatalogStore } from '@/stores/cluster-catalog-store';
import { parseClusterName } from '@/lib/cluster-names';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Server, ArrowRight, Search, Settings, RotateCw, LogIn, Loader2, CircleCheck, LayoutGrid, LayoutDashboard, List, Star, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuthProviders, useProviderLogin } from '@/hooks/use-auth-providers';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UpdateIndicator } from '@/components/layout/header';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { ClusterCard } from '@/components/clusters/cluster-card';
import { ClusterTagEditor } from '@/components/clusters/cluster-tag-editor';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Module-level flag: survive component remount so auto-login runs only once per session
let autoLoginDone = false;

export default function ClustersPage() {
  const router = useRouter();
  const { clusters, isLoading, error, isCheckingStatus, checkedClusters, refreshingClusters, refreshClusterStatus, manualRefresh, mutate } = useClusters();
  const { viewMode, setViewMode, showFavoritesOnly, setShowFavoritesOnly, getClusterMeta, toggleFavorite } = useClusterCatalogStore();
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [kubeLoggingIn, setKubeLoggingIn] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const { providers } = useAuthProviders();
  const { login: providerLogin } = useProviderLogin();
  const [providerStatuses, setProviderStatuses] = useState<Record<string, { authenticated: boolean; user?: string }>>({});
  const [loginLoadingProvider, setLoginLoadingProvider] = useState<string | null>(null);

  // Fetch provider statuses and refresh periodically so the UI reflects
  // external session changes (e.g. tsh session expiring or renewed outside the app).
  // On check failure (timeout, network error), preserve the previous status
  // to avoid falsely showing "unauthenticated" for a healthy session.
  const providerStatusesRef = useRef(providerStatuses);
  providerStatusesRef.current = providerStatuses;

  const refreshProviderStatuses = useCallback(async (providerList: typeof providers) => {
    const available = providerList.filter(p => p.available);
    if (available.length === 0) return {};
    const results = await Promise.all(
      available.map(async (p) => {
        try {
          const config = useSettingsStore.getState().authProviderConfigs[p.id] || {};
          const queryParams = new URLSearchParams(config).toString();
          const res = await fetch(`/api/auth/${p.id}/status${queryParams ? `?${queryParams}` : ''}`);
          const status = await res.json();
          return { id: p.id, status: { authenticated: status.authenticated || status.loggedIn || false, user: status.user || status.username }, ok: true };
        } catch {
          return { id: p.id, status: { authenticated: false }, ok: false };
        }
      })
    );
    // Build merged statuses synchronously from results + current snapshot.
    // Cannot rely on setState updater return value (React 18 batches updates).
    const prev = providerStatusesRef.current;
    const merged: Record<string, { authenticated: boolean; user?: string }> = { ...prev };
    for (const r of results) {
      if (r.ok) {
        merged[r.id] = r.status;
      }
    }
    setProviderStatuses(merged);
    return merged;
  }, []);

  const providersRef = useRef(providers);
  providersRef.current = providers;

  const handleProviderLogin = useCallback(async (providerId: string) => {
    setLoginLoadingProvider(providerId);
    try {
      await providerLogin(providerId);
      toast.success(`${providerId} login successful`);
      // Re-fetch provider statuses so the header reflects the new session
      refreshProviderStatuses(providersRef.current);
      // Trigger cluster list refresh with visible loading (best-effort)
      manualRefresh().catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Login failed: ${message}`);
    } finally {
      setLoginLoadingProvider(null);
    }
  }, [providerLogin, manualRefresh, refreshProviderStatuses]);

  // Initial fetch + periodic refresh (every 60 s).
  // Auto-login only once per app session; after that, expired sessions
  // just update the UI and the user clicks Login manually.
  useEffect(() => {
    if (providers.length === 0) return;

    (async () => {
      const statuses = await refreshProviderStatuses(providersRef.current);

      // Auto-login once per session for unauthenticated providers
      if (!autoLoginDone && statuses) {
        autoLoginDone = true;
        const available = providersRef.current.filter(p => p.available);
        for (const p of available) {
          if (!statuses[p.id]?.authenticated) {
            const config = useSettingsStore.getState().authProviderConfigs[p.id] || {};
            // Skip auto-login for providers that need manual configuration first
            if (p.id === 'tsh' && !config.proxyUrl) continue;
            if ((p.id === 'aws-sso' || p.id === 'aws-iam') && !config.profile) continue;
            handleProviderLogin(p.id);
            break; // one at a time — avoid multiple browser windows
          }
        }
      }
    })();

    const id = setInterval(() => refreshProviderStatuses(providersRef.current), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.length, refreshProviderStatuses, handleProviderLogin]);

  const { filtered, allTags, grouped, hasGroups } = useClustersFiltering({
    clusters,
    search,
    showFavoritesOnly,
    tagFilter,
    getClusterMeta,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await manualRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [manualRefresh]);

  const handleClusterClick = useCallback(async (contextName: string, clusterField: string, status: string) => {
    if (status === 'connected') {
      router.push(`/clusters/${encodeURIComponent(contextName)}`);
      return;
    }
    const { realName } = parseClusterName(contextName, clusterField);
    setKubeLoggingIn(contextName);
    try {
      // Detect provider for this cluster
      const detectRes = await fetch(`/api/auth/detect/${encodeURIComponent(contextName)}`);
      const detection = await detectRes.json();
      const detectedProvider = detection?.providerId;

      if (!detectedProvider) {
        toast.error('Cannot determine auth provider', {
          description: `${realName}: Configure provider in Settings > Authentication`,
        });
        setSettingsOpen(true);
        setKubeLoggingIn(null);
        return;
      }

      // Build provider-appropriate login config
      const savedConfig = useSettingsStore.getState().authProviderConfigs[detectedProvider] || {};
      // For Teleport: use --kube-cluster from exec args (authoritative), fallback to parseClusterName
      const tshKubeCluster = detection?.kubeCluster || realName;
      const loginConfig: Record<string, string> = detectedProvider === 'tsh'
        ? { ...savedConfig, action: 'kube-login', cluster: tshKubeCluster }
        : { ...savedConfig };

      const res = await fetch(`/api/auth/${detectedProvider}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginConfig),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Cluster login failed', { description: `${realName}: ${data.error || 'Unknown error'}` });
        return;
      }
      toast.success('Cluster login successful', { description: realName });
      // Optimistically mark as connected
      await mutate(
        (current) => {
          if (!current) return current;
          return {
            clusters: current.clusters.map((c) =>
              c.name === contextName ? { ...c, status: 'connected', error: undefined } : c
            ),
          };
        },
        { revalidate: false }
      );
      router.push(`/clusters/${encodeURIComponent(contextName)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Cluster login failed', { description: `${realName}: ${message}` });
    } finally {
      setKubeLoggingIn(null);
    }
  }, [router, mutate]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <header className="electron-header-inset flex h-14 items-center justify-between border-b px-4 shrink-0 drag-region">
        <div className="flex items-center gap-3 no-drag-region">
          <h1 className="text-lg font-bold tracking-tight">KubeOps</h1>
        </div>
        <div className="flex items-center gap-2 no-drag-region">
          {providers.filter(p => p.available).map((provider) => {
            const status = providerStatuses[provider.id];
            const isChecking = status === undefined;
            const isLoggingIn = loginLoadingProvider === provider.id;
            const isAuthenticated = status?.authenticated === true;
            return (
            <Tooltip key={provider.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 gap-1.5 ${isAuthenticated ? 'text-green-500' : ''}`}
                  onClick={() => !isAuthenticated && handleProviderLogin(provider.id)}
                  disabled={isLoggingIn || isChecking || isAuthenticated}
                >
                  {isLoggingIn || isChecking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isAuthenticated ? (
                    <CircleCheck className="h-4 w-4" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  <span className="text-xs">
                    {isChecking
                      ? provider.name
                      : isAuthenticated
                      ? status.user?.split('@')[0]
                      : provider.name}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isChecking
                  ? `Checking ${provider.name} status...`
                  : isAuthenticated
                  ? `Logged in as ${status.user}`
                  : `Login with ${provider.name}`}
              </TooltipContent>
            </Tooltip>
            );
          })}
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => router.push('/clusters/overview')} title="Multi-Cluster Overview">
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-xs">Overview</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={refreshing || isCheckingStatus} title="Refresh cluster list">
            <RotateCw className={`h-4 w-4 ${refreshing || isCheckingStatus ? 'animate-spin' : ''}`} />
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
                <p className="text-sm text-muted-foreground mt-1">
                  Use your cloud provider CLI to add cluster credentials.
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

                <span className="text-sm text-muted-foreground ml-auto flex items-center gap-2">
                  {isCheckingStatus && (
                    <span className="flex items-center gap-1 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking status...
                    </span>
                  )}
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
                            isStatusPending={isCheckingStatus && !checkedClusters.has(cluster.name)}
                            isRefreshing={refreshingClusters.has(cluster.name)}
                            onRefreshStatus={() => refreshClusterStatus(cluster.name)}
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
                                isStatusPending={isCheckingStatus && !checkedClusters.has(cluster.name)}
                                isRefreshing={refreshingClusters.has(cluster.name)}
                                onRefreshStatus={() => refreshClusterStatus(cluster.name)}
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
                      {filtered.filter((c) => showFavoritesOnly || !getClusterMeta(c.name).favorite || grouped.favorites.length === 0).map((cluster) => (
                        <ClusterCard
                          key={cluster.name}
                          name={cluster.name}
                          cluster={cluster.cluster}
                          server={cluster.server}
                          status={cluster.status}
                          error={cluster.error}
                          isLogging={kubeLoggingIn === cluster.name}
                          isStatusPending={isCheckingStatus && !checkedClusters.has(cluster.name)}
                          isRefreshing={refreshingClusters.has(cluster.name)}
                          onRefreshStatus={() => refreshClusterStatus(cluster.name)}
                          onClick={() => handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                          parseClusterName={parseClusterName}
                        />
                      ))}
                    </div>
                  )}
                  {filtered.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {showFavoritesOnly ? 'No favorites yet — click the star icon on a cluster to add it.'
                        : tagFilter ? `No clusters tagged "${tagFilter}".`
                        : search ? `No clusters matching "${search}".`
                        : 'No clusters found.'}
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
                    const isStatusPending = isCheckingStatus && !checkedClusters.has(cluster.name);
                    const isRefreshingSingle = refreshingClusters.has(cluster.name);
                    const showPending = isStatusPending || isRefreshingSingle;
                    return (
                      <div
                        key={cluster.name}
                        role="button"
                        tabIndex={0}
                        onClick={() => !isKubeLogging && handleClusterClick(cluster.name, cluster.cluster, cluster.status)}
                        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isKubeLogging) { e.preventDefault(); handleClusterClick(cluster.name, cluster.cluster, cluster.status); } }}
                        className={`flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors group cursor-pointer ${isKubeLogging ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        {showPending ? (
                          <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground" />
                        ) : (
                          <div
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              cluster.status === 'connected'
                                ? 'bg-green-500'
                                : cluster.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                            }`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {meta.favorite && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />}
                            <span className="font-medium truncate">
                              {prefix && <span className="text-muted-foreground">{prefix}</span>}
                              <span className="text-primary">{realName}</span>
                            </span>
                            {showPending ? (
                              <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted">
                                checking...
                              </Badge>
                            ) : (
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
                            )}
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={showPending}
                                onClick={(e) => { e.stopPropagation(); refreshClusterStatus(cluster.name); }}
                              >
                                <RotateCw className={cn('h-3 w-3 text-muted-foreground', isRefreshingSingle && 'animate-spin')} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Refresh status</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(cluster.name); }}
                              >
                                <Star className={cn('h-3.5 w-3.5', meta.favorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{meta.favorite ? 'Remove from favorites' : 'Add to favorites'}</TooltipContent>
                          </Tooltip>
                          <ClusterTagEditor contextName={cluster.name} />
                          <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {showFavoritesOnly ? 'No favorites yet — click the star icon on a cluster to add it.'
                        : tagFilter ? `No clusters tagged "${tagFilter}".`
                        : search ? `No clusters matching "${search}".`
                        : 'No clusters found.'}
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
