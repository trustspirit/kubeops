import type { KubeResource } from '@/types/resource';

type ResourceIdentity = Pick<KubeResource, 'metadata'>;

export function getResourceNamespace(resource: ResourceIdentity, selectedNamespace: string): string {
  if (selectedNamespace === '_all') return resource.metadata?.namespace || 'default';
  return resource.metadata?.namespace || selectedNamespace;
}

export function getResourceNodeId(
  kind: string,
  resource: ResourceIdentity,
  selectedNamespace: string,
): string {
  const localId = `${kind}/${resource.metadata?.name || ''}`;
  if (selectedNamespace !== '_all') return localId;
  return `${getResourceNamespace(resource, selectedNamespace)}/${localId}`;
}

export function getResourceBasePath(
  clusterId: string,
  resource: ResourceIdentity,
  selectedNamespace: string,
): string {
  return `/clusters/${encodeURIComponent(clusterId)}/namespaces/${encodeURIComponent(
    getResourceNamespace(resource, selectedNamespace),
  )}`;
}

export function resourcesShareNamespace(
  left: ResourceIdentity,
  right: ResourceIdentity,
  selectedNamespace: string,
): boolean {
  if (selectedNamespace !== '_all') return true;
  return getResourceNamespace(left, selectedNamespace) === getResourceNamespace(right, selectedNamespace);
}
