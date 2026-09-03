import type { KubeResource } from '@/types/resource';

export interface PodContainer {
  name: string;
  /** Init containers can be logged but are usually not the default target. */
  init: boolean;
}

/**
 * Container names for a pod-like resource, in the order a user expects to see
 * them: regular containers first, then init containers.
 *
 * Returns an empty array — rather than throwing or guessing — when the spec is
 * missing, so callers can surface "no containers" instead of doing nothing.
 */
export function listPodContainers(resource: KubeResource | undefined): PodContainer[] {
  const spec = resource?.spec as Record<string, unknown> | undefined;
  const read = (key: string, init: boolean): PodContainer[] => {
    const raw = spec?.[key];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => (entry as { name?: unknown })?.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .map((name) => ({ name, init }));
  };

  const seen = new Set<string>();
  return [...read('containers', false), ...read('initContainers', true)].filter((container) => {
    if (seen.has(container.name)) return false;
    seen.add(container.name);
    return true;
  });
}
