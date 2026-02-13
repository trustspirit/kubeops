import { NextRequest, NextResponse } from 'next/server';
import { getCoreV1Api } from '@/lib/k8s/client-factory';
import { getContextNamespace } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

function extractK8sError(error: unknown): { status: number; message: string } {
  const err = error as Record<string, unknown>;
  const status = (err?.code || err?.statusCode || 500) as number;
  let body = err?.body as Record<string, unknown> | string | undefined;
  if (typeof body === 'string') {
    try { body = JSON.parse(body) as Record<string, unknown>; } catch { /* keep as string */ }
  }
  return { status, message: String((typeof body === 'object' ? (body as Record<string, unknown>)?.message : body) || err?.message || 'Request failed') };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const api = getCoreV1Api(contextName);
    const res = await api.listNamespace();
    const resList = res as { items: Array<Record<string, unknown>> };
    const namespaces = resList.items.map((ns) => {
      const meta = ns.metadata as Record<string, unknown> | undefined;
      const status = ns.status as Record<string, unknown> | undefined;
      return {
        name: meta?.name,
        status: status?.phase,
        labels: meta?.labels,
        creationTimestamp: meta?.creationTimestamp,
      };
    });
    return NextResponse.json({ namespaces });
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] GET namespaces: ${status} ${message}`);

    // Fallback: return namespace from kubeconfig context + default
    const contextNs = getContextNamespace(contextName);
    const fallback = new Set<string>();
    fallback.add('default');
    if (contextNs) fallback.add(contextNs);

    return NextResponse.json({
      namespaces: Array.from(fallback).map(name => ({ name })),
      partial: true,
    });
  }
}
