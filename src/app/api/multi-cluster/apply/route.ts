import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { describeResource, parseManifest } from '@/lib/manifest';
import { extractK8sError, isObjectNotFound } from '@/lib/k8s/error-handling';
import {
  describeFieldManagerConflict,
  isFieldManagerConflict,
  mapWithConcurrency,
  TimeoutError,
  withTimeout,
} from '@/lib/k8s/apply-helpers';

export const dynamic = 'force-dynamic';

interface ApplyTarget {
  clusterId: string;
  namespace: string;
}

interface ApplyRequest {
  targets: ApplyTarget[];
  yaml: string;
  action: 'apply' | 'delete';
  dryRun?: boolean;
  /** Server-Side Apply `force`: take ownership of fields another manager owns. */
  force?: boolean;
}

interface ApplyResult {
  clusterId: string;
  namespace: string;
  status: 'success' | 'error';
  message?: string;
  /** `Kind/name` of the document this result is for (always set). */
  resource?: string;
  /** Set when the request hit the per-request timeout; the outcome on the cluster is unknown. */
  timedOut?: boolean;
}

const CLUSTER_SCOPED_KINDS = new Set([
  'APIService',
  'CertificateSigningRequest',
  'ClusterRole',
  'ClusterRoleBinding',
  'ComponentStatus',
  'CustomResourceDefinition',
  'MutatingWebhookConfiguration',
  'Namespace',
  'Node',
  'PersistentVolume',
  'PodSecurityPolicy',
  'PriorityClass',
  'RuntimeClass',
  'StorageClass',
  'ValidatingAdmissionPolicy',
  'ValidatingAdmissionPolicyBinding',
  'ValidatingWebhookConfiguration',
  'VolumeAttachment',
]);

/** Field manager recorded in managedFields for everything this route applies. */
const FIELD_MANAGER = 'kubeops';
/** Per-request budget, so one hung cluster cannot hold every other target's results. */
const REQUEST_TIMEOUT_MS = 30_000;
/** Same cap as clusters/status: exec credential plugins (tsh) choke on bursts. */
const MAX_CONCURRENT_TARGETS = 5;

/** `KubernetesObjectApi.resource` is protected but is exactly the cached discovery lookup we need. */
interface ObjectApiDiscovery {
  resource(apiVersion: string, kind: string): Promise<k8s.V1APIResource | undefined>;
}

/**
 * Asks the cluster whether the kind is namespaced (covers CRDs), falling back
 * to the built-in list when discovery fails.
 */
async function isClusterScopedResource(client: k8s.KubernetesObjectApi, resource: k8s.KubernetesObject): Promise<boolean> {
  try {
    const discovered = await (client as unknown as ObjectApiDiscovery).resource(resource.apiVersion || '', resource.kind || '');
    if (discovered) return !discovered.namespaced;
  } catch {
    // Fall through to the static list; the apply itself will report a real error.
  }
  return CLUSTER_SCOPED_KINDS.has(resource.kind || '');
}

function prepareResource(resource: k8s.KubernetesObject, namespace: string, clusterScoped: boolean, action: 'apply' | 'delete'): k8s.KubernetesObject {
  const copy = JSON.parse(JSON.stringify(resource)) as k8s.KubernetesObject;
  copy.metadata = copy.metadata || {};
  if (clusterScoped) {
    delete copy.metadata.namespace;
  } else {
    copy.metadata.namespace = namespace;
  }
  if (action === 'apply') {
    // Server-Side Apply treats resourceVersion as a precondition and rejects
    // managedFields; the rest are server-owned.
    delete copy.metadata.resourceVersion;
    delete copy.metadata.uid;
    delete copy.metadata.creationTimestamp;
    delete copy.metadata.managedFields;
    delete copy.metadata.generation;
    delete copy.metadata.selfLink;
  }
  return copy;
}

async function applyOne(
  client: k8s.KubernetesObjectApi,
  target: ApplyTarget,
  resource: k8s.KubernetesObject,
  action: 'apply' | 'delete',
  dryRun: boolean,
  force: boolean,
): Promise<ApplyResult> {
  const base = { clusterId: target.clusterId, namespace: target.namespace, resource: describeResource(resource) };
  try {
    const clusterScoped = await withTimeout(
      isClusterScopedResource(client, resource),
      REQUEST_TIMEOUT_MS,
      `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s discovering ${resource.kind}`,
    );
    const resourceCopy = prepareResource(resource, target.namespace, clusterScoped, action);

    if (action === 'apply') {
      // Server-Side Apply: one idempotent call that creates or updates, works
      // for CRDs (no strategic-merge schema needed), and reports field
      // ownership conflicts instead of silently clobbering them.
      await withTimeout(
        client.patch(
          resourceCopy,
          undefined,
          dryRun ? 'All' : undefined,
          FIELD_MANAGER,
          force,
          k8s.PatchStrategy.ServerSideApply,
        ),
        REQUEST_TIMEOUT_MS,
        `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s; the change may still be applied on the cluster`,
      );
      return { ...base, status: 'success', message: dryRun ? 'Dry run: would apply resource' : 'Resource applied' };
    }

    try {
      await withTimeout(
        client.delete(resourceCopy, undefined, dryRun ? 'All' : undefined),
        REQUEST_TIMEOUT_MS,
        `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s; the delete may still complete on the cluster`,
      );
    } catch (deleteError: unknown) {
      const { status } = extractK8sError(deleteError);
      const body = (deleteError as { body?: unknown })?.body;
      if (isObjectNotFound(status, body, resourceCopy.metadata?.name)) {
        // Already absent: the desired end state, so a retried delete succeeds.
        return { ...base, status: 'success', message: dryRun ? 'Dry run: resource does not exist' : 'Resource already absent' };
      }
      throw deleteError;
    }
    return { ...base, status: 'success', message: dryRun ? 'Dry run: would delete resource' : 'Resource deleted' };
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    const body = (error as { body?: unknown })?.body;
    const finalMessage = isFieldManagerConflict(status, body) ? describeFieldManagerConflict(message) : message;
    const timedOut = error instanceof TimeoutError;
    console.error(`[Multi-cluster Apply] ${action} ${base.resource} to ${target.clusterId}/${target.namespace}: ${status} ${finalMessage}`);
    return { ...base, status: 'error', message: finalMessage, ...(timedOut ? { timedOut: true } : {}) };
  }
}

/**
 * Runs every document against one target in manifest order (so a Namespace
 * declared first exists before what goes in it). After a timeout, the rest of
 * that target's documents are reported as not attempted rather than each
 * waiting out its own timeout against a hung cluster.
 */
async function applyToTarget(
  target: ApplyTarget,
  documents: k8s.KubernetesObject[],
  action: 'apply' | 'delete',
  dryRun: boolean,
  force: boolean,
): Promise<ApplyResult[]> {
  let client: k8s.KubernetesObjectApi;
  try {
    const kc = getKubeConfigForContext(target.clusterId);
    client = k8s.KubernetesObjectApi.makeApiClient(kc);
  } catch (error: unknown) {
    const { message } = extractK8sError(error);
    return documents.map((doc) => ({
      clusterId: target.clusterId,
      namespace: target.namespace,
      resource: describeResource(doc),
      status: 'error' as const,
      message,
    }));
  }

  const results: ApplyResult[] = [];
  let timedOut = false;
  for (const doc of documents) {
    if (timedOut) {
      results.push({
        clusterId: target.clusterId,
        namespace: target.namespace,
        resource: describeResource(doc),
        status: 'error',
        message: 'Not attempted: an earlier request to this cluster timed out',
      });
      continue;
    }
    const result = await applyOne(client, target, doc, action, dryRun, force);
    if (result.timedOut) timedOut = true;
    results.push(result);
  }
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body: ApplyRequest = await req.json();
    const { targets, yaml: yamlStr, action, dryRun = false, force = false } = body;

    // Validate request
    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: 'At least one target is required' }, { status: 400 });
    }

    if (!yamlStr || typeof yamlStr !== 'string') {
      return NextResponse.json({ error: 'YAML content is required' }, { status: 400 });
    }

    if (!action || !['apply', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "apply" or "delete"' }, { status: 400 });
    }

    const parsed = parseManifest(yamlStr);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { documents } = parsed;

    // Fan out across targets with a concurrency cap; results stay in target order.
    const results = (await mapWithConcurrency(
      targets,
      MAX_CONCURRENT_TARGETS,
      (target) => applyToTarget(target, documents, action, dryRun, force === true),
    )).flat();

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      results,
      summary: {
        succeeded,
        failed,
        total: results.length,
        documents: documents.length,
      },
    });
  } catch (error: unknown) {
    console.error('[Multi-cluster Apply] Unexpected error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
