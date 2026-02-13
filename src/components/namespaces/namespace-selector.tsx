'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useNamespaces } from '@/hooks/use-namespaces';
import { useNamespaceStore } from '@/stores/namespace-store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { FolderOpen, Check, ChevronsUpDown, Layers, Search, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ALL_NAMESPACES = '_all';

export function NamespaceSelector() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const clusterId = params?.clusterId as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : null;
  const { namespaces, isLoading } = useNamespaces(decodedClusterId);
  const {
    setActiveNamespace,
    getActiveNamespace,
    getSelectedNamespaces,
    setSelectedNamespaces,
    isMultiNamespace,
  } = useNamespaceStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize multi mode from store
  useEffect(() => {
    if (decodedClusterId) {
      const selected = getSelectedNamespaces(decodedClusterId);
      if (selected.length > 1) setMultiMode(true);
    }
  }, [decodedClusterId, getSelectedNamespaces]);

  const activeNamespace = decodedClusterId
    ? getActiveNamespace(decodedClusterId)
    : ALL_NAMESPACES;

  const selectedNamespaces = decodedClusterId
    ? getSelectedNamespaces(decodedClusterId)
    : [];

  const handleSelect = (value: string) => {
    if (!decodedClusterId) return;
    setActiveNamespace(decodedClusterId, value);
    setOpen(false);
    setQuery('');
    setMultiMode(false);
    const nsMatch = pathname.match(/\/namespaces\/[^/]+\/([^/]+)/);
    if (nsMatch && clusterId) {
      router.push(`/clusters/${clusterId}/namespaces/${value}/${nsMatch[1]}`);
    }
  };

  const handleMultiToggle = (nsName: string) => {
    if (!decodedClusterId) return;
    const current = new Set(selectedNamespaces);
    if (current.has(nsName)) {
      current.delete(nsName);
    } else {
      current.add(nsName);
    }
    const newSelected = Array.from(current);
    setSelectedNamespaces(decodedClusterId, newSelected);

    // Navigate to _all for multi mode (client-side filtering handles the rest)
    if (newSelected.length > 1) {
      const nsMatch = pathname.match(/\/namespaces\/[^/]+\/([^/]+)/);
      if (nsMatch && clusterId) {
        router.push(`/clusters/${clusterId}/namespaces/_all/${nsMatch[1]}`);
      }
    } else if (newSelected.length === 1) {
      // Single selection → treat as single mode
      handleSelect(newSelected[0]);
    }
    // length === 0: stay in multi mode, show "All Namespaces" behavior (_all)
  };

  const handleToggleAll = () => {
    if (!decodedClusterId) return;
    if (selectedNamespaces.length === nsList.length) {
      setSelectedNamespaces(decodedClusterId, []);
    } else {
      setSelectedNamespaces(decodedClusterId, [...nsList]);
    }
  };

  if (!clusterId) return null;

  const nsNames = new Set<string>(namespaces.map((ns: { name: string }) => ns.name));
  if (activeNamespace && activeNamespace !== ALL_NAMESPACES) nsNames.add(activeNamespace);
  const nsList: string[] = Array.from(nsNames).sort();

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? nsList.filter((name: string) => name.toLowerCase().includes(trimmedQuery))
    : nsList;

  // Show option to use the typed value directly if it's not in the list
  const exactMatch = nsList.some((name: string) => name.toLowerCase() === trimmedQuery);
  const showUseCustom = trimmedQuery && !exactMatch && !multiMode;

  // Use Set for O(1) lookup instead of array .includes() O(n) per item
  const selectedSet = useMemo(() => new Set(selectedNamespaces), [selectedNamespaces]);

  const isMulti = multiMode || (decodedClusterId ? isMultiNamespace(decodedClusterId) : false);
  const displayName = isMulti && selectedNamespaces.length > 1
    ? `${selectedNamespaces.length} namespaces`
    : activeNamespace === ALL_NAMESPACES
      ? 'All Namespaces'
      : activeNamespace;
  const showAllOption = !trimmedQuery || 'all namespaces'.includes(trimmedQuery);

  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-xs text-muted-foreground shrink-0'>NS</span>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            className='w-[180px] h-8 justify-between overflow-hidden'
          >
            <div className='flex items-center gap-2 min-w-0 overflow-hidden'>
              <Layers className='h-3.5 w-3.5 shrink-0' />
              <span className='truncate text-sm'>
                {!mounted || isLoading ? 'Loading...' : displayName}
              </span>
            </div>
            <ChevronsUpDown className='h-3.5 w-3.5 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className='w-[240px] p-0 overflow-hidden max-h-[320px] flex flex-col'
          align='start'
          side='bottom'
          avoidCollisions
          collisionPadding={8}
        >
          <div className='flex items-center gap-2 border-b p-2'>
            <Search className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            <input
              placeholder='Search or enter namespace...'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmedQuery && !multiMode) {
                  // Select first filtered result, or use as custom namespace
                  if (filtered.length > 0) {
                    handleSelect(filtered[0]);
                  } else {
                    handleSelect(trimmedQuery);
                  }
                }
              }}
              className='flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
              autoFocus
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setMultiMode(!multiMode);
                    if (!multiMode && decodedClusterId) {
                      // Enter multi mode: initialize with current selection
                      if (activeNamespace !== ALL_NAMESPACES) {
                        setSelectedNamespaces(decodedClusterId, [activeNamespace]);
                      }
                    } else if (multiMode && decodedClusterId) {
                      // Exit multi mode: clear multi selections
                      setSelectedNamespaces(decodedClusterId, []);
                    }
                  }}
                  className={cn(
                    'rounded-sm p-1 hover:bg-accent transition-colors shrink-0',
                    multiMode && 'bg-accent text-primary'
                  )}
                >
                  <ListChecks className='h-3.5 w-3.5' />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {multiMode ? 'Exit multi-select' : 'Multi-select namespaces'}
              </TooltipContent>
            </Tooltip>
          </div>
          <ScrollArea className='flex-1 overflow-auto'>
            <div className='p-1'>
              {multiMode ? (
                <>
                  {/* Toggle all */}
                  <button
                    onClick={handleToggleAll}
                    className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent font-medium'
                  >
                    <div className={cn(
                      'h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0',
                      selectedNamespaces.length === nsList.length && 'bg-primary border-primary'
                    )}>
                      {selectedNamespaces.length === nsList.length && (
                        <Check className='h-2.5 w-2.5 text-primary-foreground' />
                      )}
                    </div>
                    <Layers className='h-3.5 w-3.5 shrink-0' />
                    <span>All Namespaces</span>
                  </button>
                  <Separator className='my-1' />
                  {filtered.map((name) => {
                    const isSelected = selectedSet.has(name);
                    return (
                      <button
                        key={name}
                        onClick={() => handleMultiToggle(name)}
                        className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent'
                      >
                        <div className={cn(
                          'h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0',
                          isSelected && 'bg-primary border-primary'
                        )}>
                          {isSelected && (
                            <Check className='h-2.5 w-2.5 text-primary-foreground' />
                          )}
                        </div>
                        <span className='truncate'>{name}</span>
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  {showAllOption && (
                    <>
                      <button
                        onClick={() => handleSelect(ALL_NAMESPACES)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent font-medium',
                          activeNamespace === ALL_NAMESPACES && 'bg-accent',
                        )}
                      >
                        <Check
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            activeNamespace === ALL_NAMESPACES ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <Layers className='h-3.5 w-3.5 shrink-0' />
                        <span>All Namespaces</span>
                      </button>
                      <Separator className='my-1' />
                    </>
                  )}
                  {filtered.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleSelect(name)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                        activeNamespace === name && 'bg-accent',
                      )}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          activeNamespace === name ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className='truncate'>{name}</span>
                    </button>
                  ))}
                  {showUseCustom && (
                    <>
                      <Separator className='my-1' />
                      <button
                        onClick={() => handleSelect(trimmedQuery)}
                        className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-muted-foreground'
                      >
                        <FolderOpen className='h-3.5 w-3.5 shrink-0' />
                        <span>Use &quot;{trimmedQuery}&quot;</span>
                      </button>
                    </>
                  )}
                  {filtered.length === 0 && !showUseCustom && (
                    <div className='px-2 py-4 text-center text-sm text-muted-foreground'>
                      No namespaces found
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
