'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import { Server, FolderOpen, Search } from 'lucide-react';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const clusterId = params?.clusterId as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : null;
  const { clusters } = useClusters();
  const { namespaces } = useNamespaces(decodedClusterId);
  const { getActiveNamespace } = useNamespaceStore();
  const namespace = decodedClusterId ? getActiveNamespace(decodedClusterId) : 'default';

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const navigate = useCallback((path: string) => {
    router.push(path);
    setOpen(false);
  }, [router]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search clusters, resources, namespaces..." />
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
              {namespaces.slice(0, 10).map((ns: { name: string }) => (
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
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
