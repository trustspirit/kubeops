import type { KubeResource } from '@/types/resource';

export interface HelmReleaseRef {
  name: string;
  namespace: string;
}

export interface HelmSyncLatestArgsInput {
  releaseName: string;
  chart: string;
  namespace: string;
  version?: string;
  reuseValues?: boolean;
  dependencyUpdate?: boolean;
}

export interface HelmChartSearchResult {
  name: string;
  version?: string;
  chart_version?: string;
  app_version?: string;
  description?: string;
}

function normalizeManagedBy(value: string | undefined): string {
  return (value || '').toLowerCase();
}

function getRefFromResource(resource: Pick<KubeResource, 'metadata'> | null | undefined): HelmReleaseRef | null {
  const metadata = resource?.metadata;
  if (!metadata) return null;

  const annotations = metadata.annotations || {};
  const labels = metadata.labels || {};
  const annotatedName = annotations['meta.helm.sh/release-name'];
  const annotatedNamespace = annotations['meta.helm.sh/release-namespace'];

  if (annotatedName) {
    return {
      name: annotatedName,
      namespace: annotatedNamespace || metadata.namespace || 'default',
    };
  }

  const instance = labels['app.kubernetes.io/instance'] || labels.release;
  const managedBy = normalizeManagedBy(labels['app.kubernetes.io/managed-by']);
  const hasHelmMarker = managedBy === 'helm' || Boolean(labels['helm.sh/chart']);

  if (instance && hasHelmMarker) {
    return {
      name: instance,
      namespace: metadata.namespace || 'default',
    };
  }

  return null;
}

export function findHelmReleaseRef(
  resource: Pick<KubeResource, 'metadata'> | null | undefined,
  ownerResources: Array<Pick<KubeResource, 'metadata'> | null | undefined> = [],
): HelmReleaseRef | null {
  const direct = getRefFromResource(resource);
  if (direct) return direct;

  for (const owner of ownerResources) {
    const ref = getRefFromResource(owner);
    if (ref) return ref;
  }

  return null;
}

export function buildHelmSyncLatestArgs({
  releaseName,
  chart,
  namespace,
  version,
  reuseValues = true,
  dependencyUpdate = true,
}: HelmSyncLatestArgsInput): string[] {
  const args = ['upgrade', releaseName, chart, '-n', namespace, '--output', 'json'];

  if (reuseValues) {
    args.push('--reuse-values');
  }

  if (dependencyUpdate) {
    args.push('--dependency-update');
  }

  if (version) {
    args.push('--version', version);
  }

  return args;
}

export function getChartVersion(result: HelmChartSearchResult): string | undefined {
  return result.version || result.chart_version;
}

export function selectLatestChartSearchResult(
  chart: string,
  results: HelmChartSearchResult[],
): HelmChartSearchResult | null {
  const exact = results.find((result) => result.name === chart);
  if (exact) return exact;

  if (chart.includes('/')) return null;

  const basenameMatches = results.filter((result) => result.name.split('/').pop() === chart);
  return basenameMatches.length === 1 ? basenameMatches[0] : null;
}

export function parseHelmListChart(chart: string): { name: string; version?: string } {
  const match = chart.match(/^(.+)-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
  if (!match) {
    return { name: chart, version: undefined };
  }

  return {
    name: match[1],
    version: match[2],
  };
}

export function isSameChartVersion(currentVersion: string | undefined, latestVersion: string | undefined): boolean {
  if (!currentVersion || !latestVersion) return false;
  return currentVersion === latestVersion;
}
