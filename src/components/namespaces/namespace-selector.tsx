'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useNamespaces } from '@/hooks/use-namespaces';
import { useNamespaceStore } from '@/stores/namespace-store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { FolderOpen, Check, ChevronsUpDown, Layers, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const ALL_NAMESPACES = '_all';

export function NamespaceSelector() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const clusterId = params?.clusterId as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : null;
  const { namespaces, isLoading } = useNamespaces(decodedClusterId);
  const { setActiveNamespace, getActiveNamespace } = useNamespaceStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const activeNamespace = decodedClusterId
    ? getActiveNamespace(decodedClusterId)
    : ALL_NAMESPACES;

  const handleSelect = (value: string) => {
    if (!decodedClusterId) return;
    setActiveNamespace(decodedClusterId, value);
    setOpen(false);
    setQuery('');
    const nsMatch = pathname.match(/\/namespaces\/[^/]+\/([^/]+)/);
    if (nsMatch && clusterId) {
      router.push(`/clusters/${clusterId}/namespaces/${value}/${nsMatch[1]}`);
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
  const showUseCustom = trimmedQuery && !exactMatch;

  const displayName =
    activeNamespace === ALL_NAMESPACES ? 'All Namespaces' : activeNamespace;
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
                if (e.key === 'Enter' && trimmedQuery) {
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
          </div>
          <ScrollArea className='flex-1 overflow-auto'>
            <div className='p-1'>
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
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
