import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';
import { isDns1123Label, isDns1123Subdomain, isSafeCliScalar } from '@/lib/exec-validation';
import { sanitizeServerError } from '@/lib/server-error';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; namespace: string; podName: string }>;
}

/**
 * Full pod log download.
 *
 * The viewer only keeps the most recent few hundred KB in memory, so
 * "Download" used to hand back a silently truncated file. This streams the
 * complete log straight from the API server instead.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, podName } = await params;

  let contextName: string;
  let ns: string;
  let pod: string;
  try {
    contextName = decodeURIComponent(clusterId);
    ns = decodeURIComponent(namespace);
    pod = decodeURIComponent(podName);
  } catch {
    return NextResponse.json({ error: 'Malformed request path' }, { status: 400 });
  }

  const searchParams = new URL(req.url).searchParams;
  const container = searchParams.get('container') ?? undefined;
  const previous = searchParams.get('previous') === 'true';

  if (
    !isSafeCliScalar(contextName)
    || !isDns1123Subdomain(ns)
    || !isDns1123Subdomain(pod)
    || (container !== undefined && !isDns1123Label(container))
  ) {
    return NextResponse.json({ error: 'Invalid cluster, namespace, pod, or container' }, { status: 400 });
  }

  try {
    const kc = getKubeConfigForContext(contextName);
    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }

    const base = cluster.server.endsWith('/') ? cluster.server : `${cluster.server}/`;
    const url = new URL(
      `api/v1/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(pod)}/log`,
      base,
    );
    if (container) url.searchParams.set('container', container);
    url.searchParams.set('timestamps', 'true');
    if (previous) url.searchParams.set('previous', 'true');

    const requestInit = await kc.applyToFetchOptions({});
    requestInit.method = 'GET';
    requestInit.signal = req.signal;

    const upstream = await fetch(url.toString(), requestInit as RequestInit);
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      let message = `Log download failed with HTTP ${upstream.status}`;
      try {
        message = (JSON.parse(detail) as { message?: string }).message || message;
      } catch { /* keep the generic message */ }
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    const filename = `${pod}${container ? `-${container}` : ''}.log`;
    // `upstream.body` is a Node stream under node-fetch and a web stream under
    // the platform fetch; normalise so either can be returned.
    const body = upstream.body instanceof ReadableStream
      ? upstream.body
      : Readable.toWeb(upstream.body as unknown as Readable) as ReadableStream;

    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: sanitizeServerError(error, 'Failed to download logs') },
      { status: 500 },
    );
  }
}
