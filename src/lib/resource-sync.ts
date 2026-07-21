import type { KubeList, KubeResource } from '@/types/resource';
import type { WatchEvent } from '@/types/watch';

export type ResourceWatchConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export function normalizeWatchNamespace(namespace: string): string | undefined {
  return namespace === '_all' ? undefined : namespace;
}

export function applyResourceWatchEvent(
  previous: KubeList | undefined,
  event: WatchEvent,
): KubeList | undefined {
  if (!previous?.items || event.type === 'ERROR' || event.type === 'BOOKMARK') {
    return previous;
  }

  const object = event.object as KubeResource;
  const uid = object.metadata?.uid;
  if (!uid) return previous;

  const existingIndex = previous.items.findIndex((item) => item.metadata?.uid === uid);

  if (event.type === 'DELETED') {
    if (existingIndex === -1) return previous;
    return {
      ...previous,
      items: previous.items.filter((item) => item.metadata?.uid !== uid),
    };
  }

  if (event.type === 'ADDED' || event.type === 'MODIFIED') {
    if (existingIndex === -1) {
      return { ...previous, items: [...previous.items, object] };
    }

    return {
      ...previous,
      items: previous.items.map((item, index) => (index === existingIndex ? object : item)),
    };
  }

  return previous;
}

export function shouldRevalidateAfterWatchTransition(
  previous: ResourceWatchConnectionState,
  current: ResourceWatchConnectionState,
  hasConnectedBefore: boolean,
): boolean {
  return hasConnectedBefore && previous !== 'connected' && current === 'connected';
}

export function getKubeResourceRowId(resource: KubeResource, index: number): string {
  if (resource.metadata?.uid) return resource.metadata.uid;

  const name = resource.metadata?.name;
  if (name) {
    return resource.metadata.namespace ? `${resource.metadata.namespace}/${name}` : name;
  }

  return `resource-row-${index}`;
}
