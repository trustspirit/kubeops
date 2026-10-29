import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { getResourceConfig } from '@/lib/k8s/resource-api';
import { parsePropagationPolicy } from '@/lib/delete-options';
import { extractK8sError, isObjectNotFound } from '@/lib/k8s/error-handling';
import { parseListPaging } from '@/lib/k8s/list-paging';
import {
  k8sRawRequest,
  messageFromStatusBody,
  RawRequestError,
  resolvePatchContentType,
} from '@/lib/k8s/raw-request';
import type { K8sApiConstructor } from '@/types/resource';

export const dynamic = 'force-dynamic';

const API_PREFIX: Record<string, string> = {
  CoreV1Api: '/api/v1',
  AppsV1Api: '/apis/apps/v1',
  BatchV1Api: '/apis/batch/v1',
  NetworkingV1Api: '/apis/networking.k8s.io/v1',
  RbacAuthorizationV1Api: '/apis/rbac.authorization.k8s.io/v1',
  AutoscalingV2Api: '/apis/autoscaling/v2',
};

function missingName(resourceType: string) {
  return NextResponse.json({ error: `A ${resourceType} name is required` }, { status: 400 });
}

const API_CLASS_MAP: Record<string, K8sApiConstructor> = {
  CoreV1Api: k8s.CoreV1Api,
  AppsV1Api: k8s.AppsV1Api,
  BatchV1Api: k8s.BatchV1Api,
  NetworkingV1Api: k8s.NetworkingV1Api,
  RbacAuthorizationV1Api: k8s.RbacAuthorizationV1Api,
  AutoscalingV2Api: k8s.AutoscalingV2Api,
};

function getClient(contextName: string, apiClassName: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const kc = getKubeConfigForContext(contextName);
  const ApiClass = API_CLASS_MAP[apiClassName];
  if (!ApiClass) throw new Error(`Unknown API class: ${apiClassName}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return kc.makeApiClient(ApiClass as any) as Record<string, (...args: unknown[]) => Promise<unknown>>;
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
    const client = getClient(contextName, config.apiClass);

    if (resourceName) {
      const args: Record<string, string> = { name: resourceName };
      if (config.namespaced) args.namespace = namespace;
      const result = await client[config.getFn](args);
      return NextResponse.json(result);
    } else {
      // Paging is opt-in (?limit=&continue=): callers that sort the full list
      // client-side (e.g. events by time) would silently lose items otherwise.
      const paging = parseListPaging(req.nextUrl.searchParams);
      if (!paging.ok) {
        return NextResponse.json({ error: paging.error }, { status: 400 });
      }
      // Use "all namespaces" API when namespace is _all
      const isAllNamespaces = namespace === '_all' && config.namespaced && config.listAllFn;
      if (isAllNamespaces) {
        const result = await client[config.listAllFn!]({ ...paging.args });
        return NextResponse.json(result);
      }
      const args: Record<string, string | number> = { ...paging.args };
      if (config.namespaced) args.namespace = namespace;
      const result = await client[config.listFn](args);
      return NextResponse.json(result);
    }
  } catch (error: unknown) {
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
  if (!resourceName) return missingName(resourceType);

  try {
    const body = await req.json();
    const client = getClient(contextName, config.apiClass);

    const args: Record<string, unknown> = { name: resourceName, body };
    if (config.namespaced) args.namespace = namespace;
    const result = await client[config.replaceFn](args);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] PUT ${resourceType}/${resourceName} in ${namespace}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH body is sent to the API server as-is. The patch flavour follows the
 * request's Content-Type:
 *   - application/merge-patch+json            RFC 7386 merge patch (e.g. `{"spec":{"replicas":3}}`)
 *   - application/json-patch+json             RFC 6902 JSON patch (array of ops)
 *   - application/strategic-merge-patch+json  strategic merge (default, also for plain application/json)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, resourcePath } = await params;
  const contextName = decodeURIComponent(clusterId);
  const resourceType = resourcePath[0];
  const resourceName = resourcePath[1];

  const config = getResourceConfig(resourceType);
  if (!config || !config.replaceFn) {
    return NextResponse.json({ error: `Cannot patch resource type: ${resourceType}` }, { status: 400 });
  }
  if (!resourceName) return missingName(resourceType);

  const contentType = resolvePatchContentType(req.headers.get('content-type'), 'application/strategic-merge-patch+json');

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (contentType === 'application/json-patch+json' ? !Array.isArray(body) : (typeof body !== 'object' || body === null || Array.isArray(body))) {
      return NextResponse.json({ error: `Patch body does not match ${contentType}` }, { status: 400 });
    }

    const kc = getKubeConfigForContext(contextName);
    const apiPrefix = API_PREFIX[config.apiClass] || '/api/v1';
    const e = encodeURIComponent;
    const patchPath = config.namespaced
      ? `${apiPrefix}/namespaces/${e(namespace)}/${resourceType}/${e(resourceName)}`
      : `${apiPrefix}/${resourceType}/${e(resourceName)}`;

    const { status, data } = await k8sRawRequest(kc, 'PATCH', patchPath, { body, contentType });
    if (status < 200 || status >= 300) {
      // The API server answers with a Status object; surface its message, not the raw JSON.
      throw new RawRequestError(messageFromStatusBody(data, `Patch failed with HTTP ${status}`), status, data);
    }
    return NextResponse.json(data && typeof data === 'object' ? data : {});
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] PATCH ${resourceType}/${resourceName} in ${namespace}: ${status} ${message}`);
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
  if (!resourceName) return missingName(resourceType);

  const parsedPolicy = parsePropagationPolicy(new URL(req.url).searchParams.get('propagationPolicy'));
  if (!parsedPolicy.ok) {
    return NextResponse.json({ error: parsedPolicy.error }, { status: 400 });
  }
  const propagationPolicy = parsedPolicy.policy;

  try {
    const client = getClient(contextName, config.apiClass);

    const args: Record<string, string> = { name: resourceName };
    if (config.namespaced) args.namespace = namespace;
    if (propagationPolicy) args.propagationPolicy = propagationPolicy;
    const result = await client[config.deleteFn](args);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    // Already gone is the outcome the caller asked for: a retried or
    // double-submitted delete must not surface as a failure.
    if (isObjectNotFound(status, (error as { body?: unknown })?.body, resourceName)) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }
    console.error(`[K8s API] DELETE ${resourceType}/${resourceName} in ${namespace}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
