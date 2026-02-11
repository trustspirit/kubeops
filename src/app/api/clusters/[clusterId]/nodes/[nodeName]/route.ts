import { NextRequest, NextResponse } from 'next/server';
import { getCoreV1Api } from '@/lib/k8s/client-factory';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clusterId: string; nodeName: string }> }
) {
  const { clusterId, nodeName } = await params;
  const contextName = decodeURIComponent(clusterId);

  try {
    const api = getCoreV1Api(contextName);
    const res = await api.readNode({ name: nodeName });
    return NextResponse.json(res);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get node';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
