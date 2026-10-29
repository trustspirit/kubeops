import { NextRequest, NextResponse } from 'next/server';
import { runHelmMutation, isValidNamespace, parseRevision } from '@/lib/helm/helm-runner';
import { requireHelm, requireReleaseName, helmErrorResponse } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const helmCheck = await requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);

  const nameCheck = requireReleaseName(releaseName);
  if (nameCheck) return nameCheck;

  let body: { revision?: unknown; namespace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { namespace } = body;
  const revision = parseRevision(body.revision);

  if (revision === null) {
    return NextResponse.json({ error: 'revision must be a positive integer' }, { status: 400 });
  }
  if (!namespace || !isValidNamespace(namespace)) {
    return NextResponse.json({ error: 'Valid namespace is required (lowercase alphanumeric and hyphens)' }, { status: 400 });
  }

  const args = ['rollback', '-n', namespace, '--', releaseName, String(revision)];
  const result = await runHelmMutation(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] rollback ${releaseName} to ${revision} failed: ${result.stderr}`);
    return helmErrorResponse(result, `Failed to rollback release "${releaseName}" to revision ${revision}`);
  }

  return NextResponse.json({ success: true, message: result.stdout.trim() || `Rolled back "${releaseName}" to revision ${revision}` });
}
