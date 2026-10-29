import { NextRequest, NextResponse } from 'next/server';
import { runHelm, runHelmMutation, isValidNamespace } from '@/lib/helm/helm-runner';
import { requireHelm, requireNamespaceParam, requireReleaseName, helmErrorResponse } from '@/lib/helm/helpers';
import { isReleaseNotFound } from '@/lib/helm/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

function invalidNamespace() {
  return NextResponse.json({ error: 'Valid namespace is required (lowercase alphanumeric and hyphens)' }, { status: 400 });
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
  if (!isValidNamespace(namespace!)) return invalidNamespace();

  const args = ['status', '-n', namespace!, '--output', 'json', '--', releaseName];
  const result = await runHelm(args, contextName);

  if (result.code !== 0) {
    console.error(`[Helm] status ${releaseName} failed: ${result.stderr}`);
    return helmErrorResponse(result, `Failed to get status for release "${releaseName}"`);
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
  if (!isValidNamespace(namespace!)) return invalidNamespace();

  const args = ['uninstall', '-n', namespace!, '--', releaseName];
  const result = await runHelmMutation(args, contextName);

  if (result.code !== 0) {
    // Already uninstalled (e.g. a retry after a timed-out first attempt) is
    // the outcome the caller asked for.
    if (isReleaseNotFound(result.stderr)) {
      return NextResponse.json({ success: true, alreadyDeleted: true, message: `Release "${releaseName}" is not installed` });
    }
    console.error(`[Helm] uninstall ${releaseName} failed: ${result.stderr}`);
    return helmErrorResponse(result, `Failed to uninstall release "${releaseName}"`);
  }

  return NextResponse.json({ success: true, message: result.stdout.trim() });
}
