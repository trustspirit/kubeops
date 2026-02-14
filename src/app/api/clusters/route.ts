import { NextResponse } from 'next/server';
import { getContexts, getClusterServer } from '@/lib/k8s/kubeconfig-manager';
import { getCoreV1Api } from '@/lib/k8s/client-factory';
import { ClusterInfo } from '@/lib/k8s/types';

export const dynamic = 'force-dynamic';

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

export async function GET() {
  try {
    const contexts = getContexts();

    const clusters: ClusterInfo[] = await Promise.all(
      contexts.map(async (ctx): Promise<ClusterInfo> => {
        try {
          const api = getCoreV1Api(ctx.name);
          await api.getAPIResources();
          return {
            name: ctx.name,
            context: ctx.name,
            cluster: ctx.cluster,
            user: ctx.user,
            namespace: ctx.namespace || undefined,
            server: getClusterServer(ctx.name),
            status: 'connected',
          };
        } catch (error: unknown) {
          const raw = error instanceof Error ? error.message : 'Connection failed';
          return {
            name: ctx.name,
            context: ctx.name,
            cluster: ctx.cluster,
            user: ctx.user,
            namespace: ctx.namespace || undefined,
            server: getClusterServer(ctx.name),
            status: 'error',
            error: stripAnsi(raw),
          };
        }
      })
    );

    return NextResponse.json({ clusters });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list clusters';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
