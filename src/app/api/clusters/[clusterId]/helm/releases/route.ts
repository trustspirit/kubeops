import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isValidNamespace } from '@/lib/helm/helm-runner';
import { requireHelm, parseHelmJson, helmErrorResponse } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const helmCheck = await requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const { searchParams } = new URL(req.url);
  const namespace = searchParams.get('namespace');

  if (namespace && !isValidNamespace(namespace)) {
    return NextResponse.json({ error: 'Invalid namespace' }, { status: 400 });
  }

  // --all: include pending-*, uninstalling and failed releases, which plain
  // `helm list` hides — exactly the stuck ones a user needs to see.
  // --max 0: no 256-release cap.
  const args = ['list', '--all', '--max', '0', '--output', 'json'];
  if (namespace) {
    args.push('-n', namespace);
  } else {
    args.push('-A');
  }

  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] list releases failed: ${result.stderr}`);
    return helmErrorResponse(result, 'Failed to list Helm releases');
  }

  const releases = parseHelmJson(result.stdout) ?? [];
  return NextResponse.json({ releases });
}
