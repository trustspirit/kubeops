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

  const args = ['status', releaseName, '-n', namespace, '--output', 'json'];
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

  const args = ['uninstall', releaseName, '-n', namespace];
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
