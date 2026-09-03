'use client';

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useClusters } from '@/hooks/use-clusters';
import { useNamespaces } from '@/hooks/use-namespaces';
import { useNamespaceStore } from '@/stores/namespace-store';
import { SIDEBAR_SECTIONS } from '@/lib/constants';
import { Server, FolderOpen } from 'lucide-react';
import { Box } from 'lucide-react';
import { useResourceList } from '@/hooks/use-resource-list';
import { useCommandPaletteStore } from '@/stores/command-palette-store';
import type { KubeResource } from '@/types/resource';

/**
 * Rendering every object in a large namespace would make the palette sluggish,
 * so the list is capped — but the cap is applied *after* filtering on the
 * user's query. Slicing first meant anything past the cap was unreachable no
 * matter what you typed.
 */
const MAX_VISIBLE_NAMESPACES = 50;
const MAX_VISIBLE_OBJECTS = 100;

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const clusterId = params?.clusterId as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : null;
  const { clusters } = useClusters();
  const { namespaces } = useNamespaces(decodedClusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = decodedClusterId ? getActiveNamespace(decodedClusterId) : 'default';
  const resourceItems = SIDEBAR_SECTIONS.flatMap((section) => section.items);
  const pathSegments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const currentResource = resourceItems.find((item) => item.resourceType && pathSegments.includes(item.resourceType));
  const namespaceIndex = pathSegments.indexOf('namespaces');
  const currentNamespace = namespaceIndex >= 0 ? pathSegments[namespaceIndex + 1] || namespace : namespace;
  const { data: currentObjects } = useResourceList({
    clusterId: decodedClusterId,
    namespace: currentResource?.clusterScoped ? '_' : currentNamespace,
    resourceType: currentResource?.resourceType || '',
    enabled: open && Boolean(decodedClusterId && currentResource?.resourceType),
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [toggle]);

  const navigate = useCallback((path: string) => {
    router.push(path);
    setOpen(false);
    setSearch('');
  }, [router, setOpen]);

  const normalizedSearch = search.trim().toLowerCase();

  const visibleNamespaces = useMemo(() => {
    const list = namespaces as { name: string }[];
    const filtered = normalizedSearch
      ? list.filter((ns) => matches(ns.name, normalizedSearch))
      : list;
    return filtered.slice(0, MAX_VISIBLE_NAMESPACES);
  }, [namespaces, normalizedSearch]);

  const visibleObjects = useMemo(() => {
    const items: KubeResource[] = currentObjects?.items ?? [];
    const filtered = normalizedSearch
      ? items.filter((object) => matches(object.metadata?.name ?? '', normalizedSearch))
      : items;
    return filtered.slice(0, MAX_VISIBLE_OBJECTS);
  }, [currentObjects, normalizedSearch]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search clusters, resources, namespaces..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Clusters">
          {clusters.map((cluster) => (
            <CommandItem
              key={cluster.name}
              value={`cluster ${cluster.name}`}
              onSelect={() => navigate(`/clusters/${encodeURIComponent(cluster.name)}`)}
            >
              <Server className="mr-2 h-4 w-4" />
              <span>{cluster.name}</span>
              <span className={`ml-auto text-xs ${cluster.status === 'connected' ? 'text-green-500' : 'text-red-500'}`}>
                {cluster.status}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {clusterId && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Namespaces">
              {visibleNamespaces.map((ns) => (
                <CommandItem
                  key={ns.name}
                  value={`namespace ${ns.name}`}
                  onSelect={() => navigate(`/clusters/${clusterId}/namespaces/${ns.name}/pods`)}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>{ns.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Resources">
              {SIDEBAR_SECTIONS.flatMap((section) =>
                section.items.filter(item => item.resourceType).map((item) => {
                  const Icon = item.icon;
                  const path = item.clusterScoped
                    ? `/clusters/${clusterId}/${item.resourceType}`
                    : `/clusters/${clusterId}/namespaces/${namespace}/${item.resourceType}`;
                  return (
                    <CommandItem
                      key={item.resourceType}
                      value={`resource ${item.label} ${item.resourceType}`}
                      onSelect={() => navigate(path)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{item.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{section.title}</span>
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
            {currentResource && visibleObjects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Objects in ${currentResource.label}`}>
                  {visibleObjects.map((object: KubeResource) => {
                    const objectName = object.metadata?.name || '';
                    const objectNamespace = object.metadata?.namespace || currentNamespace;
                    const path = currentResource.clusterScoped
                      ? `/clusters/${clusterId}/${currentResource.resourceType}/${objectName}`
                      : `/clusters/${clusterId}/namespaces/${objectNamespace}/${currentResource.resourceType}/${objectName}`;
                    return (
                      <CommandItem
                        key={object.metadata?.uid || `${objectNamespace}/${objectName}`}
                        value={`object ${objectName} ${objectNamespace} ${currentResource.label}`}
                        onSelect={() => navigate(path)}
                      >
                        <Box className="mr-2 h-4 w-4" />
                        <span className="truncate">{objectName}</span>
                        {!currentResource.clusterScoped && (
                          <span className="ml-auto text-xs text-muted-foreground">{objectNamespace}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
