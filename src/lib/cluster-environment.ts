/**
 * Best-effort guess at what kind of environment a cluster is, from its
 * context name. Destructive actions look the same against every cluster, so
 * the UI uses this to make production visibly different and to ask for an
 * extra confirmation there.
 */
export type ClusterEnvironment = 'production' | 'staging' | 'development';

const TOKENS: Record<ClusterEnvironment, readonly string[]> = {
  production: ['prod', 'production', 'prd', 'live'],
  staging: ['staging', 'stage', 'stg', 'preprod', 'uat'],
  development: ['dev', 'development', 'test', 'qa', 'sandbox', 'local', 'docker', 'minikube', 'kind'],
};

/**
 * Matches whole name segments only ("prod" in `eks-prod-1`, not in
 * `reproducer`). Production wins when a name carries more than one marker.
 */
export function getClusterEnvironment(name: string | null | undefined): ClusterEnvironment | null {
  if (!name) return null;
  const segments = new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  for (const environment of ['production', 'staging', 'development'] as const) {
    if (TOKENS[environment].some((token) => segments.has(token))) return environment;
  }
  return null;
}

export function isProductionCluster(name: string | null | undefined): boolean {
  return getClusterEnvironment(name) === 'production';
}

export const ENVIRONMENT_LABELS: Record<ClusterEnvironment, string> = {
  production: 'PROD',
  staging: 'STAGING',
  development: 'DEV',
};
