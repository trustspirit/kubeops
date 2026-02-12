import { NextRequest, NextResponse } from 'next/server';
import { runHelm } from '@/lib/helm/helm-runner';
import { requireHelm, parseHelmJson } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

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

  const releases = parseHelmJson(result.stdout) ?? [];
  return NextResponse.json({ releases });
}
