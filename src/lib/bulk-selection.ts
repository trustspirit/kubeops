export interface BulkTarget {
  name: string;
  namespace: string;
}

export interface NamespaceGroup {
  namespace: string;
  names: string[];
}

interface MaybeNamed {
  metadata?: { name?: string; namespace?: string };
}

/**
 * Resolves selected rows to concrete delete targets. Rows without a name are
 * dropped; rows without a namespace (cluster-scoped, or a namespace-less row
 * projection) use `fallbackNamespace`, which is also what the delete URL uses.
 */
export function toBulkTargets(resources: MaybeNamed[], fallbackNamespace: string): BulkTarget[] {
  const targets: BulkTarget[] = [];
  for (const resource of resources) {
    const name = resource.metadata?.name;
    if (!name) continue;
    targets.push({ name, namespace: resource.metadata?.namespace || fallbackNamespace });
  }
  return targets;
}

/** Groups targets by namespace (sorted), names sorted within each group. */
export function groupByNamespace(targets: BulkTarget[]): NamespaceGroup[] {
  const groups = new Map<string, string[]>();
  for (const target of targets) {
    const list = groups.get(target.namespace) ?? [];
    list.push(target.name);
    groups.set(target.namespace, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([namespace, names]) => ({ namespace, names: [...names].sort((a, b) => a.localeCompare(b)) }));
}
