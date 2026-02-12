import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isHelmAvailable } from '@/lib/helm/helm-runner';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH. Please install Helm to manage releases.' },
      { status: 503 }
    );
  }

  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace');

  const args = ['list', '--output', 'json'];
  if (namespace) {
    args.push('-n', namespace);
  } else {
    args.push('-A');
  }

  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] list releases failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || 'Failed to list Helm releases' },
      { status: 500 }
    );
  }

  try {
    const releases = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    return NextResponse.json({ releases });
  } catch (e) {
    console.error(`[Helm] Failed to parse releases output: ${result.stdout}`);
    return NextResponse.json(
      { error: 'Failed to parse Helm output' },
      { status: 500 }
    );
  }
}
