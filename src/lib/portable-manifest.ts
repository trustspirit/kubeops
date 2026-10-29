import * as yaml from 'js-yaml';

/** Metadata the API server owns or that only means something in the source cluster. */
const SERVER_OWNED_METADATA = [
  'managedFields',
  'resourceVersion',
  'uid',
  'creationTimestamp',
  'generation',
  'selfLink',
  'deletionTimestamp',
  'deletionGracePeriodSeconds',
  // Owner UIDs belong to the source cluster. Applied elsewhere they point at
  // an owner that does not exist, and the garbage collector deletes the copy.
  'ownerReferences',
] as const;

const LAST_APPLIED_ANNOTATION = 'kubectl.kubernetes.io/last-applied-configuration';

/**
 * Strips a live object down to what can be applied to another cluster.
 *
 * Returns a copy: `status`, server-owned metadata and the last-applied
 * annotation are removed. The point is also stability — the multi-cluster
 * dialog is seeded from polled data, and `status` changes on every poll.
 */
export function toPortableResource<T extends object>(resource: T): Record<string, unknown> {
  const clean = { ...(resource as Record<string, unknown>) };
  delete clean.status;

  const metadata = clean.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = { ...(metadata as Record<string, unknown>) };
    for (const field of SERVER_OWNED_METADATA) delete meta[field];

    const annotations = meta.annotations;
    if (annotations && typeof annotations === 'object' && LAST_APPLIED_ANNOTATION in annotations) {
      const rest = { ...(annotations as Record<string, unknown>) };
      delete rest[LAST_APPLIED_ANNOTATION];
      if (Object.keys(rest).length > 0) meta.annotations = rest;
      else delete meta.annotations;
    }
    clean.metadata = meta;
  }
  return clean;
}

/** `toPortableResource` serialised as YAML, for seeding an apply editor. */
export function toPortableYaml<T extends object>(resource: T | null | undefined): string {
  if (!resource) return '';
  return yaml.dump(toPortableResource(resource), { lineWidth: -1 });
}

/**
 * YAML for in-place editing of the same object: `status` (server-owned and
 * often hundreds of lines) and `managedFields` are dropped, but
 * `resourceVersion` stays so the API can reject a write that raced with
 * someone else.
 */
export function toEditableYaml<T extends object>(resource: T): string {
  const clean = { ...(resource as Record<string, unknown>) };
  delete clean.status;
  const metadata = clean.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = { ...(metadata as Record<string, unknown>) };
    delete meta.managedFields;
    clean.metadata = meta;
  }
  return yaml.dump(clean, { lineWidth: -1 });
}

/** Whether a value (e.g. what an SWR `mutate()` resolved to) looks like a Kubernetes object. */
export function looksLikeResource(value: unknown): value is { kind: string; metadata: object } {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { kind?: unknown }).kind === 'string' &&
    typeof (value as { metadata?: unknown }).metadata === 'object'
  );
}
