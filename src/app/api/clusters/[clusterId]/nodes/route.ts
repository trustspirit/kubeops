import { NextRequest, NextResponse } from 'next/server';
import { getCoreV1Api } from '@/lib/k8s/client-factory';

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
    const res = await api.listNode();
    return NextResponse.json(res);
  } catch (error: unknown) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] GET nodes: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
