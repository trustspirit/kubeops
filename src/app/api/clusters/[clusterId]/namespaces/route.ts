import { NextRequest, NextResponse } from 'next/server';
import { getCoreV1Api } from '@/lib/k8s/client-factory';
import { getContextNamespace } from '@/lib/k8s/kubeconfig-manager';

export const dynamic = 'force-dynamic';

function extractK8sError(error: any): { status: number; message: string } {
  const status = error?.code || error?.statusCode || 500;
  let body = error?.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* keep as string */ }
  }
  return { status, message: body?.message || error?.message || 'Request failed' };
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
    const namespaces = (res as any).items.map((ns: any) => ({
      name: ns.metadata?.name,
      status: ns.status?.phase,
      labels: ns.metadata?.labels,
      creationTimestamp: ns.metadata?.creationTimestamp,
    }));
    return NextResponse.json({ namespaces });
  } catch (error: any) {
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
