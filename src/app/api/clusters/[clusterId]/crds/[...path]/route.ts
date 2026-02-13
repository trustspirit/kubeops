/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    clusterId: string;
    path: string[]; // [group, version, plural] or [group, version, plural, name]
  }>;
}

function extractK8sError(error: any): { status: number; message: string } {
  const raw = error?.statusCode || error?.response?.statusCode || error?.code;
  const status = typeof raw === 'number' && raw >= 200 && raw <= 599 ? raw : 500;
  let body = error?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }
  const message = body?.message || error?.message || 'Request failed';
  return { status, message };
}

function buildApiPath(group: string, version: string, plural: string, namespace?: string, name?: string): string {
  const base = `/apis/${group}/${version}`;
  if (namespace && namespace !== '_' && namespace !== '_all') {
    const path = `${base}/namespaces/${namespace}/${plural}`;
    return name ? `${path}/${name}` : path;
  }
  const path = `${base}/${plural}`;
  return name ? `${path}/${name}` : path;
}

async function makeK8sRequest(
  contextName: string,
  method: string,
  apiPath: string,
  body?: any
): Promise<{ status: number; data: any }> {
  const kc = getKubeConfigForContext(contextName);
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new Error('Cluster not found');

  const opts: any = {};
  await kc.applyToHTTPSOptions(opts);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');
  const urlObj = new URL(`${cluster.server}${apiPath}`);

  return new Promise((resolve, reject) => {
    const reqData = body ? JSON.stringify(body) : undefined;
    const contentType = method === 'PATCH'
      ? 'application/merge-patch+json'
      : 'application/json';

    const reqOpts: any = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': contentType,
        Accept: 'application/json',
        ...(reqData ? { 'Content-Length': Buffer.byteLength(reqData) } : {}),
      },
      ca: opts.ca,
      cert: opts.cert,
      key: opts.key,
      rejectUnauthorized: !(cluster as any).skipTLSVerify,
    };

    // Apply auth headers (bearer token, etc.)
    if (opts.headers) {
      Object.assign(reqOpts.headers, opts.headers);
    }

    const request = https.request(reqOpts, (res: any) => {
      let responseBody = '';
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });
    request.on('error', reject);
    if (reqData) request.write(reqData);
    request.end();
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
      { error: data?.message || 'Request failed' },
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
      { error: data?.message || 'Update failed' },
      { status }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] PUT CR ${group}/${version}/${plural}/${name}: ${status} ${message}`);
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
    return NextResponse.json(
      { error: data?.message || 'Delete failed' },
      { status }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] DELETE CR ${group}/${version}/${plural}/${name}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
