import { NextRequest, NextResponse } from 'next/server';
import { checkClusterStatus } from '@/lib/k8s/cluster-status-cache';

export const dynamic = 'force-dynamic';

/**
 * Check health status for a single cluster by context name.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const contextName = decodeURIComponent(name);
  const entry = await checkClusterStatus(contextName);
  return NextResponse.json({
    name: contextName,
    status: entry.status,
    error: entry.error ?? null,
  });
}
