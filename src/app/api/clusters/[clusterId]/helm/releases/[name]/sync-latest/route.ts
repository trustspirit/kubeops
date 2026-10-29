import { NextRequest, NextResponse } from 'next/server';
import { runHelm, runHelmMutation, isValidNamespace, isValidChartRef } from '@/lib/helm/helm-runner';
import { requireHelm, requireReleaseName, parseHelmJson, helmErrorResponse } from '@/lib/helm/helpers';
import { exactReleaseFilter } from '@/lib/helm/errors';
import {
  buildHelmSyncLatestArgs,
  findCurrentChartVersion,
  getChartVersion,
  isPendingReleaseStatus,
  isSameChartVersion,
  selectLatestChartSearchResult,
  type HelmChartSearchResult,
  type HelmListEntry,
} from '@/lib/helm/sync-latest';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

interface SyncLatestBody {
  chart?: string;
  namespace?: string;
  reuseValues?: boolean;
  dependencyUpdate?: boolean;
  version?: string;
  /** Ignored: the deployed version is read from the cluster, not trusted from the client. */
  currentVersion?: string;
}

function isValidChartVersion(version: string): boolean {
  return version.length > 0 && version.length <= 256 && !version.startsWith('-');
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const helmCheck = await requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);

  const nameCheck = requireReleaseName(releaseName);
  if (nameCheck) return nameCheck;

  let body: SyncLatestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const namespace = body.namespace?.trim();
  const chart = body.chart?.trim();
  const requestedVersion = body.version?.trim();

  if (!chart || !isValidChartRef(chart)) {
    return NextResponse.json({ error: 'Valid chart reference is required (for example, repo/chart)' }, { status: 400 });
  }
  if (!namespace || !isValidNamespace(namespace)) {
    return NextResponse.json({ error: 'Valid namespace is required (lowercase alphanumeric and hyphens)' }, { status: 400 });
  }
  if (requestedVersion && !isValidChartVersion(requestedVersion)) {
    return NextResponse.json({ error: 'Valid chart version is required' }, { status: 400 });
  }

  // Read what is actually deployed. A client-supplied version can be stale
  // (another user upgraded) and would wrongly skip or repeat the upgrade.
  const current = await runHelm(
    ['list', '-n', namespace, '--all', '--max', '0', '--filter', exactReleaseFilter(releaseName), '--output', 'json'],
    contextName,
  );
  if (current.code !== 0) {
    console.error(`[Helm] list ${releaseName} failed: ${current.stderr}`);
    return helmErrorResponse(current, `Failed to read release "${releaseName}"`);
  }
  const deployed = findCurrentChartVersion(parseHelmJson<HelmListEntry[]>(current.stdout) ?? [], releaseName);
  if (!deployed) {
    return NextResponse.json({ error: `Release "${releaseName}" not found in namespace "${namespace}"` }, { status: 404 });
  }
  if (isPendingReleaseStatus(deployed.status)) {
    return NextResponse.json(
      { error: `Release "${releaseName}" is ${deployed.status}: another operation is in progress. Check the release history before retrying.` },
      { status: 409 },
    );
  }
  const currentVersion = deployed.version;

  const repoUpdate = await runHelm(['repo', 'update'], undefined, 120_000);
  if (repoUpdate.code !== 0) {
    console.error(`[Helm] repo update failed: ${repoUpdate.stderr}`);
    return helmErrorResponse(repoUpdate, 'Failed to update Helm repositories');
  }

  const search = await runHelm(['search', 'repo', '--output', 'json', '--', chart]);
  if (search.code !== 0) {
    console.error(`[Helm] search repo ${chart} failed: ${search.stderr}`);
    return helmErrorResponse(search, `Failed to find latest chart for "${chart}"`);
  }

  const results = parseHelmJson<HelmChartSearchResult[]>(search.stdout) ?? [];
  const latest = selectLatestChartSearchResult(chart, results);
  if (!latest) {
    return NextResponse.json(
      { error: `Could not resolve "${chart}" to a single chart. Enter the full chart reference, such as repo/chart.` },
      { status: 400 },
    );
  }

  const latestVersion = requestedVersion || getChartVersion(latest);
  if (isSameChartVersion(currentVersion, latestVersion)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      releaseName,
      namespace,
      chart: latest.name,
      chartVersion: latestVersion,
      appVersion: latest.app_version,
      message: `Release "${releaseName}" is already using chart version ${latestVersion}`,
    });
  }

  const args = buildHelmSyncLatestArgs({
    releaseName,
    chart: latest.name,
    namespace,
    version: latestVersion,
    reuseValues: body.reuseValues ?? true,
    dependencyUpdate: body.dependencyUpdate ?? true,
  });

  const result = await runHelmMutation(args, contextName);
  if (result.code !== 0) {
    console.error(`[Helm] sync latest ${releaseName} failed: ${result.stderr}`);
    return helmErrorResponse(result, `Failed to sync Helm release "${releaseName}"`);
  }

  const upgraded = parseHelmJson(result.stdout) ?? { success: true, message: result.stdout.trim() };
  return NextResponse.json({
    success: true,
    releaseName,
    namespace,
    chart: latest.name,
    chartVersion: latestVersion,
    appVersion: latest.app_version,
    result: upgraded,
  });
}
