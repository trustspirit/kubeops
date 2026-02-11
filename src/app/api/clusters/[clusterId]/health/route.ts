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
    const versionInfo = await api.getAPIResources();
    return NextResponse.json({ status: 'connected', version: versionInfo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    const isTeleportAuth = message.includes('credentials') || message.includes('certificate') || message.includes('unauthorized');
    return NextResponse.json({
      status: 'error',
      error: message,
      isTeleportAuth,
      hint: isTeleportAuth ? 'Run `tsh kube login <cluster>` to refresh credentials' : undefined,
    }, { status: 503 });
  }
}
