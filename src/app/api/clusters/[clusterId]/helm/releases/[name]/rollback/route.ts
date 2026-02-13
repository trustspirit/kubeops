/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { runHelm } from '@/lib/helm/helm-runner';
import { requireHelm } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { revision, namespace } = body;

  if (!revision) {
    return NextResponse.json({ error: 'revision is required' }, { status: 400 });
  }
  if (!namespace) {
    return NextResponse.json({ error: 'namespace is required' }, { status: 400 });
  }

  const args = ['rollback', releaseName, String(revision), '-n', namespace];
  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] rollback ${releaseName} to ${revision} failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || `Failed to rollback release "${releaseName}" to revision ${revision}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: result.stdout.trim() || `Rolled back "${releaseName}" to revision ${revision}` });
}
