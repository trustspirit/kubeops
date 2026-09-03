import * as yaml from 'js-yaml';
import type { KubernetesObject } from '@kubernetes/client-node';

/** Upper bound so one paste cannot fan out into an unbounded number of writes. */
export const MAX_MANIFEST_DOCUMENTS = 50;

export type ParsedManifest =
  | { ok: true; documents: KubernetesObject[] }
  | { ok: false; error: string };

export function describeResource(resource: KubernetesObject): string {
  return `${resource.kind}/${resource.metadata?.name}`;
}

/**
 * Parses a manifest that may contain several `---`-separated documents.
 *
 * `yaml.load` accepts a single document and throws on anything else, so pasting
 * the output of `kubectl get -o yaml` or a rendered Helm template failed with an
 * opaque "expected a single document" error.
 */
export function parseManifest(yamlStr: string): ParsedManifest {
  let raw: unknown[];
  try {
    raw = yaml.loadAll(yamlStr);
  } catch (e: unknown) {
    return { ok: false, error: `Invalid YAML: ${(e as { message?: string }).message}` };
  }

  // `---` separators produce empty documents; those are padding, not content.
  const documents = raw.filter((doc): doc is KubernetesObject => (
    doc !== null && doc !== undefined && typeof doc === 'object' && !Array.isArray(doc)
  ));

  if (documents.length === 0) {
    return { ok: false, error: 'YAML must contain at least one Kubernetes resource object' };
  }
  if (documents.length > MAX_MANIFEST_DOCUMENTS) {
    return {
      ok: false,
      error: `Too many documents (${documents.length}); the limit is ${MAX_MANIFEST_DOCUMENTS}`,
    };
  }

  for (const [index, resource] of documents.entries()) {
    const where = documents.length > 1 ? ` (document ${index + 1})` : '';
    if (!resource.kind) return { ok: false, error: `Resource must have a "kind" field${where}` };
    if (!resource.apiVersion) return { ok: false, error: `Resource must have an "apiVersion" field${where}` };
    if (!resource.metadata?.name) return { ok: false, error: `Resource must have a "metadata.name" field${where}` };
  }

  return { ok: true, documents };
}
