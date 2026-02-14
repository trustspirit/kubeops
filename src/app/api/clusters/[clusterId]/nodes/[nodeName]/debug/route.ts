import { NextRequest, NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    clusterId: string;
    nodeName: string;
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

// POST: Create debug pod on node
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { clusterId, nodeName } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const body = await req.json().catch(() => ({}));
    const image = body.image || 'busybox';

    // Validate image name: allow standard Docker image references only
    // (alphanumeric, dots, dashes, underscores, slashes, colons for tags)
    const imageRe = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]+$/;
    if (!imageRe.test(image)) {
      return NextResponse.json({ error: 'Invalid image name' }, { status: 400 });
    }

    const timestamp = Date.now();
    const podName = `node-debug-${nodeName}-${timestamp}`;

    const kc = getKubeConfigForContext(contextName);
    const api = kc.makeApiClient(k8s.CoreV1Api);

    const debugPod: k8s.V1Pod = {
      metadata: {
        name: podName,
        namespace: 'default',
        labels: {
          'kubeops.dev/debug': 'true',
          'kubeops.dev/debug-node': nodeName,
        },
      },
      spec: {
        nodeName,
        hostPID: true,
        hostNetwork: true,
        restartPolicy: 'Never',
        tolerations: [
          { operator: 'Exists' },
        ],
        volumes: [
          {
            name: 'host-root',
            hostPath: {
              path: '/',
            },
          },
        ],
        containers: [
          {
            name: 'debugger',
            image,
            command: ['sleep', '3600'],
            stdin: true,
            tty: true,
            securityContext: {
              privileged: true,
            },
            volumeMounts: [
              {
                name: 'host-root',
                mountPath: '/host',
              },
            ],
          },
        ],
      },
    };

    await api.createNamespacedPod({
      namespace: 'default',
      body: debugPod,
    });

    // Poll for running state
    const timeout = 60000;
    const interval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, interval));
      try {
        const podStatus = await api.readNamespacedPod({
          name: podName,
          namespace: 'default',
        });
        const phase = podStatus.status?.phase;
        if (phase === 'Running') {
          return NextResponse.json({
            podName,
            namespace: 'default',
            status: 'running',
          });
        }
        if (phase === 'Failed' || phase === 'Unknown') {
          return NextResponse.json(
            { error: `Debug pod entered ${phase} state` },
            { status: 500 }
          );
        }
      } catch {
        // Pod might not be ready yet, continue polling
      }
    }

    // Timeout: attempt to clean up the debug pod that failed to start
    try {
      await api.deleteNamespacedPod({
        name: podName,
        namespace: 'default',
      });
    } catch {
      // Best effort cleanup -- pod may still be scheduling
    }

    return NextResponse.json(
      { error: 'Timeout waiting for debug pod to start. Pod has been cleaned up.', podName, namespace: 'default' },
      { status: 408 }
    );
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[NodeDebug] POST debug pod on ${nodeName}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

// DELETE: Clean up debug pod
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const { searchParams } = new URL(req.url);
  const podName = searchParams.get('podName');

  if (!podName) {
    return NextResponse.json({ error: 'Missing podName parameter' }, { status: 400 });
  }

  try {
    const kc = getKubeConfigForContext(contextName);
    const api = kc.makeApiClient(k8s.CoreV1Api);

    await api.deleteNamespacedPod({
      name: podName,
      namespace: 'default',
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[NodeDebug] DELETE debug pod ${podName}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}

// GET: List active debug pods for node
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { clusterId, nodeName } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const kc = getKubeConfigForContext(contextName);
    const api = kc.makeApiClient(k8s.CoreV1Api);

    const result = await api.listNamespacedPod({
      namespace: 'default',
      labelSelector: `kubeops.dev/debug=true,kubeops.dev/debug-node=${nodeName}`,
    });

    const pods = (result.items || []).map((pod: k8s.V1Pod) => ({
      podName: pod.metadata?.name,
      namespace: pod.metadata?.namespace,
      status: pod.status?.phase?.toLowerCase() || 'unknown',
      createdAt: pod.metadata?.creationTimestamp,
      image: pod.spec?.containers?.[0]?.image,
    }));

    return NextResponse.json({ pods });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[NodeDebug] GET debug pods for ${nodeName}: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
