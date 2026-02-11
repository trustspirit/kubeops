import { NextRequest, NextResponse } from 'next/server';
import { getCoreV1Api } from '@/lib/k8s/client-factory';

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
    const res = await api.listNode();
    return NextResponse.json(res);
  } catch (error: any) {
    const { status, message } = extractK8sError(error);
    console.error(`[K8s API] GET nodes: ${status} ${message}`);
    return NextResponse.json({ error: message }, { status });
  }
}
