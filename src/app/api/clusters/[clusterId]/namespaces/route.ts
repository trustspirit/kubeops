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
    const res = await api.listNamespace();
    const namespaces = (res as any).items.map((ns: any) => ({
      name: ns.metadata?.name,
      status: ns.status?.phase,
      labels: ns.metadata?.labels,
      creationTimestamp: ns.metadata?.creationTimestamp,
    }));
    return NextResponse.json({ namespaces });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list namespaces';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
