import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { NAMESPACED_RESOURCES, CLUSTER_SCOPED_RESOURCES, getResourceConfig } from '@/lib/k8s/resource-api';

export const dynamic = 'force-dynamic';

function extractK8sError(error: any): { status: number; message: string } {
  const status = error?.code || error?.statusCode || error?.response?.statusCode || 500;

  // error.body can be a parsed object or a raw JSON string
  let body = error?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }

  const message = body?.message || error?.message || 'Request failed';
  return { status, message };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_CLASS_MAP: Record<string, any> = {
  CoreV1Api: k8s.CoreV1Api,
  AppsV1Api: k8s.AppsV1Api,
  BatchV1Api: k8s.BatchV1Api,
  NetworkingV1Api: k8s.NetworkingV1Api,
  RbacAuthorizationV1Api: k8s.RbacAuthorizationV1Api,
};

function getClient(contextName: string, apiClassName: string) {
  const kc = getKubeConfigForContext(contextName);
  const ApiClass = API_CLASS_MAP[apiClassName];
  if (!ApiClass) throw new Error(`Unknown API class: ${apiClassName}`);
  return kc.makeApiClient(ApiClass as any);
}

interface RouteParams {
  params: Promise<{
    clusterId: string;
    namespace: string;
    resourcePath: string[];
  }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, resourcePath } = await params;
  const contextName = decodeURIComponent(clusterId);
  const resourceType = resourcePath[0];
  const resourceName = resourcePath[1];

  const config = getResourceConfig(resourceType);
  if (!config) {
    return NextResponse.json({ error: `Unknown resource type: ${resourceType}` }, { status: 400 });
  }

  try {
    const client: any = getClient(contextName, config.apiClass);

    if (resourceName) {
      const args: any = { name: resourceName };
      if (config.namespaced) args.namespace = namespace;
      const result = await client[config.getFn](args);
      return NextResponse.json(result);
    } else {
      // Use "all namespaces" API when namespace is _all
      const isAllNamespaces = namespace === '_all' && config.namespaced && config.listAllFn;
      if (isAllNamespaces) {
        const result = await client[config.listAllFn!]();
        return NextResponse.json(result);
      }
      const args: any = {};
      if (config.namespaced) args.namespace = namespace;
      const result = await client[config.listFn](args);
      return NextResponse.json(result);
    }
  } catch (error: any) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] GET ${resourceType}${resourceName ? `/${resourceName}` : ''} in ${namespace}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, resourcePath } = await params;
  const contextName = decodeURIComponent(clusterId);
  const resourceType = resourcePath[0];
  const resourceName = resourcePath[1];

  const config = getResourceConfig(resourceType);
  if (!config || !config.replaceFn) {
    return NextResponse.json({ error: `Cannot update resource type: ${resourceType}` }, { status: 400 });
  }

  try {
    const body = await req.json();
    const client: any = getClient(contextName, config.apiClass);

    const args: any = { name: resourceName, body };
    if (config.namespaced) args.namespace = namespace;
    const result = await client[config.replaceFn](args);
    return NextResponse.json(result);
  } catch (error: any) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] PUT ${resourceType}/${resourceName} in ${namespace}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, resourcePath } = await params;
  const contextName = decodeURIComponent(clusterId);
  const resourceType = resourcePath[0];
  const resourceName = resourcePath[1];

  const config = getResourceConfig(resourceType);
  if (!config || !config.deleteFn) {
    return NextResponse.json({ error: `Cannot delete resource type: ${resourceType}` }, { status: 400 });
  }

  try {
    const client: any = getClient(contextName, config.apiClass);

    const args: any = { name: resourceName };
    if (config.namespaced) args.namespace = namespace;
    const result = await client[config.deleteFn](args);
    return NextResponse.json(result);
  } catch (error: any) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] DELETE ${resourceType}/${resourceName} in ${namespace}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
