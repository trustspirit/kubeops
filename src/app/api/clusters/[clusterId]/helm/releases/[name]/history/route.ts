import { NextRequest, NextResponse } from 'next/server';
import { runHelm } from '@/lib/helm/helm-runner';
import { requireHelm, requireNamespaceParam } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace');

  const nsCheck = requireNamespaceParam(namespace);
  if (nsCheck) return nsCheck;

  const args = ['history', releaseName, '-n', namespace!, '--output', 'json'];
  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] history ${releaseName} failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || `Failed to get history for release "${releaseName}"` },
      { status: 500 }
    );
  }

  try {
    const history = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse Helm output' },
      { status: 500 }
    );
  }
}
