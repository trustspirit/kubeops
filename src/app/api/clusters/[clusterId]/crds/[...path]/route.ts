import { NextRequest, NextResponse } from 'next/server';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { extractK8sError, isObjectNotFound } from '@/lib/k8s/error-handling';
import { k8sRawRequest, messageFromStatusBody, type RawResponse } from '@/lib/k8s/raw-request';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    clusterId: string;
    path: string[]; // [group, version, plural] or [group, version, plural, name]
  }>;
}

function buildApiPath(group: string, version: string, plural: string, namespace?: string, name?: string): string {
  const e = encodeURIComponent;
  const base = `/apis/${e(group)}/${e(version)}`;
  if (namespace && namespace !== '_' && namespace !== '_all') {
    const path = `${base}/namespaces/${e(namespace)}/${e(plural)}`;
    return name ? `${path}/${e(name)}` : path;
  }
  const path = `${base}/${e(plural)}`;
  return name ? `${path}/${e(name)}` : path;
}

async function makeK8sRequest(
  contextName: string,
  method: string,
  apiPath: string,
  body?: Record<string, unknown>,
): Promise<RawResponse> {
  const kc = getKubeConfigForContext(contextName);
  return k8sRawRequest(kc, method, apiPath, {
    body,
    // Custom resources don't support strategic merge patch.
    contentType: method === 'PATCH' ? 'application/merge-patch+json' : 'application/json',
  });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { clusterId, path } = await params;
  const contextName = decodeURIComponent(clusterId);
  const [group, version, plural, name] = path;

  if (!group || !version || !plural) {
    return NextResponse.json({ error: 'Path must be: group/version/plural[/name]' }, { status: 400 });
  }

  const namespace = req.nextUrl.searchParams.get('namespace') || undefined;

  try {
    const apiPath = buildApiPath(group, version, plural, namespace, name);
    const { status, data } = await makeK8sRequest(contextName, 'GET', apiPath);

    if (status >= 200 && status < 300) {
      return NextResponse.json(data);
    }
    return NextResponse.json(
      { error: messageFromStatusBody(data, 'Request failed') },
      { status }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] GET CR ${group}/${version}/${plural}${name ? `/${name}` : ''}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { clusterId, path } = await params;
  const contextName = decodeURIComponent(clusterId);
  const [group, version, plural, name] = path;

  if (!group || !version || !plural || !name) {
    return NextResponse.json({ error: 'Path must be: group/version/plural/name' }, { status: 400 });
  }

  const namespace = req.nextUrl.searchParams.get('namespace') || undefined;

  try {
    const body = await req.json();
    const apiPath = buildApiPath(group, version, plural, namespace, name);
    const { status, data } = await makeK8sRequest(contextName, 'PUT', apiPath, body);

    if (status >= 200 && status < 300) {
      return NextResponse.json(data);
    }
    return NextResponse.json(
      { error: messageFromStatusBody(data, 'Update failed') },
      { status }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] PUT CR ${group}/${version}/${plural}/${name}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { clusterId, path } = await params;
  const contextName = decodeURIComponent(clusterId);
  const [group, version, plural, name] = path;

  if (!group || !version || !plural || !name) {
    return NextResponse.json({ error: 'Path must be: group/version/plural/name' }, { status: 400 });
  }

  const namespace = req.nextUrl.searchParams.get('namespace') || undefined;

  try {
    const body = await req.json();
    const apiPath = buildApiPath(group, version, plural, namespace, name);
    const { status, data } = await makeK8sRequest(contextName, 'PATCH', apiPath, body);

    if (status >= 200 && status < 300) {
      return NextResponse.json(data);
    }
    return NextResponse.json(
      { error: messageFromStatusBody(data, 'Patch failed') },
      { status }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] PATCH CR ${group}/${version}/${plural}/${name}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { clusterId, path } = await params;
  const contextName = decodeURIComponent(clusterId);
  const [group, version, plural, name] = path;

  if (!group || !version || !plural || !name) {
    return NextResponse.json({ error: 'Path must be: group/version/plural/name' }, { status: 400 });
  }

  const namespace = req.nextUrl.searchParams.get('namespace') || undefined;

  try {
    const apiPath = buildApiPath(group, version, plural, namespace, name);
    const { status, data } = await makeK8sRequest(contextName, 'DELETE', apiPath);

    if (status >= 200 && status < 300) {
      return NextResponse.json(data);
    }
    // Deleting something that is already gone is the outcome the caller wanted;
    // a retried or double-clicked delete must not surface as an error.
    if (isObjectNotFound(status, data, name)) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }
    return NextResponse.json(
      { error: messageFromStatusBody(data, 'Delete failed') },
      { status }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] DELETE CR ${group}/${version}/${plural}/${name}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
