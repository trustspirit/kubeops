'use client';

import { useEffect, useState, useCallback } from 'react';
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
import type { KubeResource } from '@/types/resource';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
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
            {currentResource && (currentObjects?.items?.length ?? 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Objects in ${currentResource.label}`}>
                  {currentObjects!.items.slice(0, 50).map((object: KubeResource) => {
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
