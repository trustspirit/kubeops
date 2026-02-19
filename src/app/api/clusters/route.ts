import { NextResponse } from 'next/server';
import { getContexts, getClusterServer } from '@/lib/k8s/kubeconfig-manager';
import { ClusterInfo } from '@/lib/k8s/types';
import { getCachedStatus, isStatusStale, refreshStatusesInBackground } from '@/lib/k8s/cluster-status-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const contexts = getContexts();

    // Return cluster metadata immediately using cached status (no blocking health checks)
    const clusters: ClusterInfo[] = contexts.map((ctx) => {
      const cached = getCachedStatus(ctx.name);
      return {
        name: ctx.name,
        context: ctx.name,
        cluster: ctx.cluster,
        user: ctx.user,
        namespace: ctx.namespace || undefined,
        server: getClusterServer(ctx.name),
        status: cached?.status ?? 'disconnected',
        error: cached?.error,
      };
    });

    // Trigger background health checks for stale entries (fire-and-forget)
    const staleNames = contexts
      .filter((ctx) => isStatusStale(ctx.name))
      .map((ctx) => ctx.name);
    if (staleNames.length > 0) {
      refreshStatusesInBackground(staleNames).catch(() => {});
    }

    return NextResponse.json({ clusters });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list clusters';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
