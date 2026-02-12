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

  const args = ['status', releaseName, '-n', namespace!, '--output', 'json'];
  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] status ${releaseName} failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || `Failed to get status for release "${releaseName}"` },
      { status: 500 }
    );
  }

  try {
    const detail = JSON.parse(result.stdout);
    return NextResponse.json(detail);
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse Helm output' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace');

  const nsCheck = requireNamespaceParam(namespace);
  if (nsCheck) return nsCheck;

  const args = ['uninstall', releaseName, '-n', namespace!];
  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] uninstall ${releaseName} failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || `Failed to uninstall release "${releaseName}"` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: result.stdout.trim() });
}
