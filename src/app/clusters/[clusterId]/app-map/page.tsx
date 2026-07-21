'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useNamespaceStore } from '@/stores/namespace-store';
import { useResourceTree } from '@/hooks/use-resource-tree';
import { ResourceTreeView } from '@/components/shared/resource-tree';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { WatchStatusIndicator } from '@/components/shared/watch-status-indicator';
import { FreshnessIndicator } from '@/components/shared/freshness-indicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { deriveAppMapView, summarizeAppMap } from '@/lib/app-map-view';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Some resources could not be refreshed.';
}

export default function AppMapPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = getActiveNamespace(decodedClusterId);
  const [appFilter, setAppFilter] = useState<string | undefined>();
  const [appPickerOpen, setAppPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [showNoise, setShowNoise] = useState(false);

  const {
    nodes,
    edges,
    isLoading,
    isRefreshing,
    error,
    lastUpdatedAt,
    refresh,
    appLabels,
  } = useResourceTree({
    clusterId: decodedClusterId,
    namespace,
    appFilter,
  });

  const summary = useMemo(() => summarizeAppMap(nodes, edges), [nodes, edges]);
  const visible = useMemo(
    () => deriveAppMapView(nodes, edges, { query, problemsOnly, showNoise }),
    [nodes, edges, query, problemsOnly, showNoise],
  );
  const hasFilters = Boolean(appFilter || query || problemsOnly || showNoise);
  const problemCount = summary.progressing + summary.degraded + summary.unknown;
  const namespaceLabel = namespace === '_all' ? 'all namespaces' : `${namespace} namespace`;

  const resetFilters = () => {
    setAppFilter(undefined);
    setQuery('');
    setProblemsOnly(false);
    setShowNoise(false);
  };

  if (isLoading && nodes.length === 0) return <LoadingSkeleton />;

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">App Map</h1>
          <p className="text-sm text-muted-foreground">
            Resource relationships across {namespaceLabel}
            {' · '}{visible.nodes.length === summary.total
              ? `${summary.total} resources`
              : `${visible.nodes.length} of ${summary.total} resources`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <WatchStatusIndicator />
          <FreshnessIndicator lastUpdatedAt={lastUpdatedAt} />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={isRefreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="truncate">Showing the last known map. {errorMessage(error)}</span>
          </div>
          <Button variant="outline" size="sm" className="h-7" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 p-2.5">
        <button
          type="button"
          className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium"
          onClick={() => setProblemsOnly(false)}
        >
          {summary.total} total
        </button>
        <span className="rounded-md bg-green-500/10 px-2.5 py-1.5 text-xs font-medium text-green-600 dark:text-green-400">
          {summary.healthy} healthy
        </span>
        <span className="rounded-md bg-yellow-500/10 px-2.5 py-1.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
          {summary.progressing} progressing
        </span>
        <span className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          {summary.degraded} degraded
        </span>

        <div className="mx-1 h-5 w-px bg-border" />

        <div className="relative min-w-[190px] flex-1 md:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search resources or status…"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Popover open={appPickerOpen} onOpenChange={setAppPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 min-w-[150px] justify-between gap-2 text-xs">
              <span className="truncate">{appFilter || 'All applications'}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Search applications…" />
              <CommandList>
                <CommandEmpty>No application label found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all applications"
                    onSelect={() => {
                      setAppFilter(undefined);
                      setAppPickerOpen(false);
                    }}
                  >
                    <Check className={cn('h-4 w-4', appFilter ? 'opacity-0' : 'opacity-100')} />
                    All applications
                  </CommandItem>
                  {appLabels.map((label) => (
                    <CommandItem
                      key={label}
                      value={label}
                      onSelect={() => {
                        setAppFilter(label);
                        setAppPickerOpen(false);
                      }}
                    >
                      <Check className={cn('h-4 w-4', appFilter === label ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant={problemsOnly ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={problemCount === 0}
          onClick={() => setProblemsOnly((current) => !current)}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Problems{problemCount > 0 ? ` (${problemCount})` : ''}
        </Button>

        {summary.hiddenNoise > 0 && (
          <Button
            variant={showNoise ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowNoise((current) => !current)}
          >
            {showNoise ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showNoise ? 'Hide noise' : `Show ${summary.hiddenNoise} hidden`}
          </Button>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {isRefreshing && nodes.length > 0 && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2 rounded-md border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Updating map…
          </div>
        )}
        {visible.nodes.length > 0 ? (
          <ResourceTreeView
            treeNodes={visible.nodes}
            treeEdges={visible.edges}
            height="100%"
            direction="LR"
            zoomOnScroll
          />
        ) : (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 text-center">
            <div>
              <p className="text-sm font-medium">No resources match the current view</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Clear filters or show hidden resources to restore the map.
              </p>
            </div>
            {hasFilters && <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
