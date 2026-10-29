import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isValidNamespace } from '@/lib/helm/helm-runner';
import { requireHelm, requireNamespaceParam, requireReleaseName, helmErrorResponse } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const helmCheck = await requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace');

  const nameCheck = requireReleaseName(releaseName);
  if (nameCheck) return nameCheck;
  const nsCheck = requireNamespaceParam(namespace);
  if (nsCheck) return nsCheck;
  if (!isValidNamespace(namespace!)) {
    return NextResponse.json({ error: 'Valid namespace is required (lowercase alphanumeric and hyphens)' }, { status: 400 });
  }

  const args = ['history', '-n', namespace!, '--output', 'json', '--', releaseName];
  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] history ${releaseName} failed: ${result.stderr}`);
    return helmErrorResponse(result, `Failed to get history for release "${releaseName}"`);
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
