import { NextRequest, NextResponse } from 'next/server';
import { getCoreV1Api } from '@/lib/k8s/client-factory';

export const dynamic = 'force-dynamic';

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
    const message = error instanceof Error ? error.message : 'Failed to list nodes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
