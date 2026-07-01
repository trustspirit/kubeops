import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isValidNamespace, isValidChartRef } from '@/lib/helm/helm-runner';
import { requireHelm, parseHelmJson } from '@/lib/helm/helpers';
import {
  buildHelmSyncLatestArgs,
  getChartVersion,
  isSameChartVersion,
  selectLatestChartSearchResult,
  type HelmChartSearchResult,
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
  currentVersion?: string;
}

function isValidChartVersion(version: string): boolean {
  return version.length > 0 && version.length <= 256 && !version.startsWith('-');
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);

  let body: SyncLatestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const namespace = body.namespace?.trim();
  const chart = body.chart?.trim();
  const requestedVersion = body.version?.trim();
  const currentVersion = body.currentVersion?.trim();

  if (!chart || !isValidChartRef(chart)) {
    return NextResponse.json({ error: 'Valid chart reference is required (for example, repo/chart)' }, { status: 400 });
  }
  if (!namespace || !isValidNamespace(namespace)) {
    return NextResponse.json({ error: 'Valid namespace is required (lowercase alphanumeric and hyphens)' }, { status: 400 });
  }
  if (requestedVersion && !isValidChartVersion(requestedVersion)) {
    return NextResponse.json({ error: 'Valid chart version is required' }, { status: 400 });
  }

  const repoUpdate = await runHelm(['repo', 'update'], undefined, 120_000);
  if (repoUpdate.code !== 0) {
    console.error(`[Helm] repo update failed: ${repoUpdate.stderr}`);
    return NextResponse.json(
      { error: repoUpdate.stderr || 'Failed to update Helm repositories' },
      { status: 500 },
    );
  }

  const search = await runHelm(['search', 'repo', chart, '--output', 'json']);
  if (search.code !== 0) {
    console.error(`[Helm] search repo ${chart} failed: ${search.stderr}`);
    return NextResponse.json(
      { error: search.stderr || `Failed to find latest chart for "${chart}"` },
      { status: 500 },
    );
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

  const result = await runHelm(args, contextName);
  if (result.code !== 0) {
    console.error(`[Helm] sync latest ${releaseName} failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || `Failed to sync Helm release "${releaseName}"` },
      { status: 500 },
    );
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
