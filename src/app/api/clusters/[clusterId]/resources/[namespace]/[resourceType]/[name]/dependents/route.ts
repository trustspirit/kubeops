import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    clusterId: string;
    namespace: string;
    resourceType: string;
    name: string;
  }>;
}

interface DependentNode {
  kind: string;
  name: string;
  namespace?: string;
  status?: string;
  dependents: DependentNode[];
}

function extractK8sError(error: unknown): { status: number; message: string } {
  const err = error as { statusCode?: number; response?: { statusCode?: number }; code?: number; body?: string | { message?: string }; message?: string };
  const raw = err?.statusCode || err?.response?.statusCode || err?.code;
  const status = (typeof raw === 'number' && raw >= 200 && raw <= 599) ? raw : 500;
  let body = err?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body) as { message?: string }; } catch { /* keep as string */ }
  }
  const bodyMsg = typeof body === 'object' && body !== null ? (body as { message?: string }).message : undefined;
  const message = bodyMsg || err?.message || 'Request failed';
  return { status, message };
}

function getResourceStatus(resource: k8s.KubernetesObject): string {
  const status = resource as unknown as { status?: Record<string, unknown>; spec?: Record<string, unknown>; metadata?: { deletionTimestamp?: string } };
  const s = status.status;
  const spec = status.spec;
  // Pod status
  if (s?.phase) {
    return status.metadata?.deletionTimestamp ? 'Terminating' : String(s.phase);
  }
  // Deployment/ReplicaSet/StatefulSet status
  if (s?.readyReplicas !== undefined) {
    const desired = Number(spec?.replicas ?? s?.replicas ?? 0);
    const ready = Number(s.readyReplicas ?? 0);
    if (ready === desired) return 'Ready';
    return `${ready}/${desired} Ready`;
  }
  // Job status
  if (s?.succeeded !== undefined) {
    if (Number(s.succeeded) > 0) return 'Complete';
    if (Number(s.failed) > 0) return 'Failed';
    if (Number(s.active) > 0) return 'Running';
    return 'Pending';
  }
  return 'Active';
}

async function findDependents(
  coreApi: k8s.CoreV1Api,
  appsApi: k8s.AppsV1Api,
  batchApi: k8s.BatchV1Api,
  namespace: string,
  ownerUid: string,
  ownerKind: string,
  ownerName: string,
  visited: Set<string>
): Promise<DependentNode[]> {
  const key = `${ownerKind}/${ownerName}/${ownerUid}`;
  if (visited.has(key)) return [];
  visited.add(key);

  const dependents: DependentNode[] = [];

  // Search Pods
  try {
    const pods = await coreApi.listNamespacedPod({ namespace });
    for (const pod of pods.items || []) {
      const refs = pod.metadata?.ownerReferences || [];
      if (refs.some((r: k8s.V1OwnerReference) => r.uid === ownerUid)) {
        const podUid = pod.metadata?.uid || '';
        const childDeps = await findDependents(
          coreApi, appsApi, batchApi, namespace, podUid, 'Pod', pod.metadata?.name || '', visited
        );
        dependents.push({
          kind: 'Pod',
          name: pod.metadata?.name || '',
          namespace: pod.metadata?.namespace,
          status: getResourceStatus(pod as k8s.KubernetesObject),
          dependents: childDeps,
        });
      }
    }
  } catch { /* ignore search errors */ }

  // Search ReplicaSets
  try {
    const rsList = await appsApi.listNamespacedReplicaSet({ namespace });
    for (const rs of rsList.items || []) {
      const refs = rs.metadata?.ownerReferences || [];
      if (refs.some((r: k8s.V1OwnerReference) => r.uid === ownerUid)) {
        const rsUid = rs.metadata?.uid || '';
        const childDeps = await findDependents(
          coreApi, appsApi, batchApi, namespace, rsUid, 'ReplicaSet', rs.metadata?.name || '', visited
        );
        dependents.push({
          kind: 'ReplicaSet',
          name: rs.metadata?.name || '',
          namespace: rs.metadata?.namespace,
          status: getResourceStatus(rs as k8s.KubernetesObject),
          dependents: childDeps,
        });
      }
    }
  } catch { /* ignore search errors */ }

  // Search Jobs
  try {
    const jobList = await batchApi.listNamespacedJob({ namespace });
    for (const job of jobList.items || []) {
      const refs = job.metadata?.ownerReferences || [];
      if (refs.some((r: k8s.V1OwnerReference) => r.uid === ownerUid)) {
        const jobUid = job.metadata?.uid || '';
        const childDeps = await findDependents(
          coreApi, appsApi, batchApi, namespace, jobUid, 'Job', job.metadata?.name || '', visited
        );
        dependents.push({
          kind: 'Job',
          name: job.metadata?.name || '',
          namespace: job.metadata?.namespace,
          status: getResourceStatus(job as k8s.KubernetesObject),
          dependents: childDeps,
        });
      }
    }
  } catch { /* ignore search errors */ }

  return dependents;
}

function countNodes(nodes: DependentNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countNodes(node.dependents);
  }
  return count;
}

// GET: Find all dependent resources
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, resourceType, name } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const kc = getKubeConfigForContext(contextName);
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const batchApi = kc.makeApiClient(k8s.BatchV1Api);

    // Get the target resource to find its UID
    let targetResource: k8s.KubernetesObject;
    let targetKind: string;

    switch (resourceType) {
      case 'pods':
        targetResource = await coreApi.readNamespacedPod({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'Pod';
        break;
      case 'deployments':
        targetResource = await appsApi.readNamespacedDeployment({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'Deployment';
        break;
      case 'statefulsets':
        targetResource = await appsApi.readNamespacedStatefulSet({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'StatefulSet';
        break;
      case 'daemonsets':
        targetResource = await appsApi.readNamespacedDaemonSet({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'DaemonSet';
        break;
      case 'replicasets':
        targetResource = await appsApi.readNamespacedReplicaSet({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'ReplicaSet';
        break;
      case 'jobs':
        targetResource = await batchApi.readNamespacedJob({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'Job';
        break;
      case 'cronjobs':
        targetResource = await batchApi.readNamespacedCronJob({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'CronJob';
        break;
      case 'services':
        targetResource = await coreApi.readNamespacedService({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'Service';
        break;
      case 'configmaps':
        targetResource = await coreApi.readNamespacedConfigMap({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'ConfigMap';
        break;
      case 'secrets':
        targetResource = await coreApi.readNamespacedSecret({ name, namespace }) as k8s.KubernetesObject;
        targetKind = 'Secret';
        break;
      default:
        return NextResponse.json({ error: `Unsupported resource type: ${resourceType}` }, { status: 400 });
    }

    const uid = targetResource.metadata?.uid;
    if (!uid) {
      return NextResponse.json({ error: 'Resource has no UID' }, { status: 500 });
    }

    const visited = new Set<string>();
    const dependents = await findDependents(coreApi, appsApi, batchApi, namespace, uid, targetKind, name, visited);
    const totalCount = countNodes(dependents);

    const tree: DependentNode = {
      kind: targetKind,
      name,
      namespace: targetResource.metadata?.namespace,
      status: getResourceStatus(targetResource),
      dependents,
    };

    return NextResponse.json({ tree, totalCount });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[Dependents] GET dependents for ${resourceType}/${name} in ${namespace}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
