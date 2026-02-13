import { NextRequest, NextResponse } from 'next/server';
import * as https from 'https';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    clusterId: string;
    namespace: string;
    podName: string;
  }>;
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

// POST: Inject ephemeral debug container into pod
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { clusterId, namespace, podName } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const body = await req.json().catch(() => ({}));
    const image = body.image || 'busybox';
    const targetContainer = body.targetContainer || undefined;
    const timestamp = Date.now();
    const containerName = `debugger-${timestamp}`;

    const kc = getKubeConfigForContext(contextName);

    // Check K8s version >= 1.25
    const versionApi = kc.makeApiClient(k8s.VersionApi);
    const versionInfo = await versionApi.getCode();
    const major = parseInt(versionInfo.major || '0', 10);
    const minor = parseInt((versionInfo.minor || '0').replace(/\D/g, ''), 10);

    if (major < 1 || (major === 1 && minor < 25)) {
      return NextResponse.json(
        { error: `Ephemeral containers require Kubernetes >= 1.25 (current: ${versionInfo.major}.${versionInfo.minor})` },
        { status: 400 }
      );
    }

    const api = kc.makeApiClient(k8s.CoreV1Api);

    // Read current pod to get existing ephemeral containers
    const currentPod = await api.readNamespacedPod({
      name: podName,
      namespace,
    });

    const existingEphemeral = currentPod.spec?.ephemeralContainers || [];

    // Build new ephemeral container
    const newEphemeral: k8s.V1EphemeralContainer = {
      name: containerName,
      image,
      stdin: true,
      tty: true,
    };

    if (targetContainer) {
      newEphemeral.targetContainerName = targetContainer;
    }

    // Strategic merge patch to add the ephemeral container
    // We need to use the raw K8s API for strategic merge patch on ephemeralcontainers subresource
    const cluster = kc.getCurrentCluster();
    if (!cluster) throw new Error('Cluster not found');
    const opts: { ca?: string; cert?: string; key?: string; headers?: Record<string, string> } = {};
    await kc.applyToHTTPSOptions(opts as Parameters<typeof kc.applyToHTTPSOptions>[0]);

    const patchBody = {
      spec: {
        ephemeralContainers: [...existingEphemeral, newEphemeral],
      },
    };

    const patchPath = `/api/v1/namespaces/${namespace}/pods/${podName}/ephemeralcontainers`;

    const urlObj = new URL(`${cluster.server}${patchPath}`);
    await new Promise<Record<string, unknown>>((resolve, reject) => {
      const patchData = JSON.stringify(patchBody);
      const reqOpts: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/strategic-merge-patch+json',
          'Content-Length': String(Buffer.byteLength(patchData)),
        } as Record<string, string>,
        ca: opts.ca, cert: opts.cert, key: opts.key,
        rejectUnauthorized: !(cluster as { skipTLSVerify?: boolean }).skipTLSVerify,
        timeout: 30000, // 30s request timeout to prevent hanging
      };

      // Add authorization header if present
      if (opts.headers?.Authorization) {
        (reqOpts.headers as Record<string, string>).Authorization = opts.headers.Authorization;
      }

      const request = https.request(reqOpts, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(responseBody) as Record<string, unknown>); } catch { resolve({}); }
          } else {
            let errBody: Record<string, unknown>;
            try { errBody = JSON.parse(responseBody) as Record<string, unknown>; } catch { errBody = { message: responseBody }; }
            reject({ statusCode: res.statusCode, body: errBody, message: (errBody.message as string) || responseBody });
          }
        });
      });
      request.on('timeout', () => {
        request.destroy(new Error('Request timed out'));
      });
      request.on('error', reject);
      request.write(patchData);
      request.end();
    });

    // Poll for ephemeral container to be running (timeout 30s)
    const timeout = 30000;
    const interval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, interval));
      try {
        const podStatus = await api.readNamespacedPod({
          name: podName,
          namespace,
        });

        const ephStatuses = podStatus.status?.ephemeralContainerStatuses || [];
        const debugStatus = ephStatuses.find((s: k8s.V1ContainerStatus) => s.name === containerName);
        if (debugStatus?.state?.running) {
          return NextResponse.json({
            containerName,
            status: 'running',
          });
        }
      } catch {
        // Pod status might not be updated yet
      }
    }

    // Return success even if not confirmed running - the container was created
    return NextResponse.json({
      containerName,
      status: 'created',
    });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[PodDebug] POST ephemeral container on ${podName}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
