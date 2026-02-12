import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isHelmAvailable } from '@/lib/helm/helm-runner';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH.' },
      { status: 503 }
    );
  }

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace');

  if (!namespace) {
    return NextResponse.json(
      { error: 'namespace query parameter is required' },
      { status: 400 }
    );
  }

  const args = ['history', releaseName, '-n', namespace, '--output', 'json'];
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
