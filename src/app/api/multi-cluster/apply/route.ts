import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { describeResource, parseManifest } from '@/lib/manifest';

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
}

interface ApplyResult {
  clusterId: string;
  namespace: string;
  status: 'success' | 'error';
  message?: string;
  /** Identifies which document in a multi-document manifest this result is for. */
  resource?: string;
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

function isClusterScopedResource(resource: k8s.KubernetesObject): boolean {
  return CLUSTER_SCOPED_KINDS.has(resource.kind || '');
}

function extractK8sError(error: unknown): string {
  const err = error as { body?: string | { message?: string }; message?: string };
  let body = err?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body) as { message?: string }; } catch { /* keep as string */ }
  }
  const bodyMsg = typeof body === 'object' && body !== null ? (body as { message?: string }).message : undefined;
  return bodyMsg || err?.message || 'Unknown error';
}

async function applyToTarget(
  target: ApplyTarget,
  resource: k8s.KubernetesObject,
  action: 'apply' | 'delete',
  dryRun: boolean,
): Promise<ApplyResult> {
  try {
    const kc = getKubeConfigForContext(target.clusterId);
    const client = k8s.KubernetesObjectApi.makeApiClient(kc);

    // Create a deep copy and set the namespace
    const resourceCopy = JSON.parse(JSON.stringify(resource));
    if (resourceCopy.metadata) {
      if (isClusterScopedResource(resourceCopy)) {
        delete resourceCopy.metadata.namespace;
      } else {
        resourceCopy.metadata.namespace = target.namespace;
      }
      // Remove resourceVersion for apply to avoid conflicts
      if (action === 'apply') {
        delete resourceCopy.metadata.resourceVersion;
        delete resourceCopy.metadata.uid;
        delete resourceCopy.metadata.creationTimestamp;
        delete resourceCopy.metadata.managedFields;
      }
    }

    if (action === 'apply') {
      try {
        // Try patch first (update existing)
        await client.patch(
          resourceCopy,
          undefined,
          dryRun ? 'All' : undefined,
          undefined,
          undefined,
          undefined,
        );
        return {
          clusterId: target.clusterId,
          namespace: target.namespace,
          status: 'success',
          message: dryRun ? 'Dry run: would update resource' : 'Resource updated',
        };
      } catch (patchError: unknown) {
        const pe = patchError as { statusCode?: number; response?: { statusCode?: number } };
        const statusCode = pe?.statusCode || pe?.response?.statusCode;
        if (statusCode === 404) {
          // Resource doesn't exist, create it
          await client.create(
            resourceCopy,
            undefined,
            dryRun ? 'All' : undefined,
          );
          return {
            clusterId: target.clusterId,
            namespace: target.namespace,
            status: 'success',
            message: dryRun ? 'Dry run: would create resource' : 'Resource created',
          };
        }
        throw patchError;
      }
    } else {
      // delete action
      await client.delete(
        resourceCopy,
        undefined,
        dryRun ? 'All' : undefined,
      );
      return {
        clusterId: target.clusterId,
        namespace: target.namespace,
        status: 'success',
        message: dryRun ? 'Dry run: would delete resource' : 'Resource deleted',
      };
    }
  } catch (error: unknown) {
    const message = extractK8sError(error);
    console.error(`[Multi-cluster Apply] ${action} to ${target.clusterId}/${target.namespace}: ${message}`);
    return {
      clusterId: target.clusterId,
      namespace: target.namespace,
      status: 'error',
      message,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: ApplyRequest = await req.json();
    const { targets, yaml: yamlStr, action, dryRun = false } = body;

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
    const multiDocument = documents.length > 1;

    // Fan out across targets in parallel, but keep the documents in manifest
    // order within a target so a Namespace declared first is created first.
    const results = (await Promise.all(
      targets.map(async (target) => {
        const perTarget: ApplyResult[] = [];
        for (const resource of documents) {
          const result = await applyToTarget(target, resource, action, dryRun);
          perTarget.push(multiDocument ? { ...result, resource: describeResource(resource) } : result);
        }
        return perTarget;
      }),
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
