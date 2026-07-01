import type { KubeResource } from '@/types/resource';

export const ARGOCD_GROUP = 'argoproj.io';
export const ARGOCD_VERSION = 'v1alpha1';
export const ARGOCD_APPLICATIONS_PLURAL = 'applications';
export const ARGOCD_INSTANCE_LABEL = 'argocd.argoproj.io/instance';
export const APP_INSTANCE_LABEL = 'app.kubernetes.io/instance';
export const ARGOCD_REFRESH_ANNOTATION = 'argocd.argoproj.io/refresh';

export type ArgoCDRefreshType = 'normal' | 'hard';

export interface ArgoCDSourceSummary {
  type: 'Helm' | 'Git' | 'Multi-source' | 'Unknown';
  name: string;
  revision: string;
  repoURL: string;
}

export interface ArgoCDApplication extends KubeResource {
  spec?: {
    project?: string;
    source?: {
      repoURL?: string;
      path?: string;
      chart?: string;
      targetRevision?: string;
      helm?: {
        releaseName?: string;
        valueFiles?: string[];
      };
    };
    sources?: Array<{
      repoURL?: string;
      path?: string;
      chart?: string;
      targetRevision?: string;
      ref?: string;
    }>;
    destination?: {
      server?: string;
      namespace?: string;
      name?: string;
    };
    syncPolicy?: {
      automated?: Record<string, unknown>;
      syncOptions?: string[];
    };
    [key: string]: unknown;
  };
  status?: {
    sync?: {
      status?: string;
      revision?: string;
    };
    health?: {
      status?: string;
    };
    operationState?: {
      phase?: string;
      message?: string;
    };
    summary?: {
      images?: string[];
    };
    [key: string]: unknown;
  };
}

type ArgoCDApplicationSource = NonNullable<NonNullable<ArgoCDApplication['spec']>['sources']>[number];

export function findArgoCDAppName(resource: Pick<KubeResource, 'metadata'> | null | undefined): string | null {
  const labels = resource?.metadata?.labels || {};
  return labels[ARGOCD_INSTANCE_LABEL] || null;
}

export function getArgoCDAppNameCandidates(resource: Pick<KubeResource, 'metadata'> | null | undefined): string[] {
  const labels = resource?.metadata?.labels || {};
  const candidates = [
    labels[ARGOCD_INSTANCE_LABEL],
    labels[APP_INSTANCE_LABEL],
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

export function findArgoCDApplicationRefForResource(
  resource: Pick<KubeResource, 'metadata'> | null | undefined,
  applications: Array<Pick<ArgoCDApplication, 'metadata'> | null | undefined>,
): { name: string; namespace: string } | null {
  const candidates = getArgoCDAppNameCandidates(resource);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const app = applications.find((item) => item?.metadata?.name === candidate && item.metadata.namespace);
    if (app?.metadata?.name && app.metadata.namespace) {
      return {
        name: app.metadata.name,
        namespace: app.metadata.namespace,
      };
    }
  }

  return null;
}

export function buildArgoCDRefreshPatch(type: ArgoCDRefreshType): Record<string, unknown> {
  return {
    metadata: {
      annotations: {
        [ARGOCD_REFRESH_ANNOTATION]: type,
      },
    },
  };
}

export function buildArgoCDSyncPatch(): Record<string, unknown> {
  return {
    operation: {
      initiatedBy: {
        username: 'kubeops',
      },
      sync: {
        syncStrategy: {
          hook: {},
        },
      },
    },
  };
}

function compactUnique(values: Array<string | undefined>, fallback = '-'): string {
  const uniqueValues = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  return uniqueValues.length > 0 ? uniqueValues.join(', ') : fallback;
}

function describeSourceName(source: ArgoCDApplicationSource, index: number): string {
  return source.chart || source.path || source.ref || `source-${index + 1}`;
}

export function getArgoCDAppSourceSummary(app: Pick<ArgoCDApplication, 'metadata' | 'spec'>): ArgoCDSourceSummary {
  const sources = app.spec?.sources || [];
  if (sources.length > 0) {
    return {
      type: 'Multi-source',
      name: compactUnique(sources.map((source, index) => describeSourceName(source, index))),
      revision: compactUnique(sources.map((source) => source.targetRevision)),
      repoURL: compactUnique(sources.map((source) => source.repoURL)),
    };
  }

  const source = app.spec?.source;
  if (!source) {
    return {
      type: 'Unknown',
      name: '-',
      revision: '-',
      repoURL: '-',
    };
  }

  if (source.chart) {
    return {
      type: 'Helm',
      name: source.chart,
      revision: source.targetRevision || '-',
      repoURL: source.repoURL || '-',
    };
  }

  return {
    type: 'Git',
    name: source.path || app.metadata.name,
    revision: source.targetRevision || '-',
    repoURL: source.repoURL || '-',
  };
}

export function getArgoCDAppApiUrl(clusterId: string, appName: string, namespace: string): string {
  return `/api/clusters/${encodeURIComponent(clusterId)}/crds/${ARGOCD_GROUP}/${ARGOCD_VERSION}/${ARGOCD_APPLICATIONS_PLURAL}/${encodeURIComponent(appName)}?namespace=${encodeURIComponent(namespace)}`;
}

export function getArgoCDAppHref(clusterId: string, appName: string, namespace?: string): string {
  const base = `/clusters/${clusterId}/argocd/${encodeURIComponent(appName)}`;
  return namespace ? `${base}?namespace=${encodeURIComponent(namespace)}` : base;
}
