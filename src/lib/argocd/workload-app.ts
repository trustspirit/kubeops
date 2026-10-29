import type { KubeResource } from '@/types/resource';
import { APP_INSTANCE_LABEL, ARGOCD_INSTANCE_LABEL, type ArgoCDApplication } from './helpers';

export const ARGOCD_TRACKING_ID_ANNOTATION = 'argocd.argoproj.io/tracking-id';

/** In-cluster destination as Argo CD writes it for the cluster it runs in. */
const IN_CLUSTER_SERVER = 'https://kubernetes.default.svc';
const IN_CLUSTER_NAME = 'in-cluster';

export type ArgoCDAppCandidateSource = 'tracking-id' | 'argocd-label' | 'instance-label';

export interface ArgoCDAppCandidate {
  name: string;
  /** Application namespace, known only from an apps-in-any-namespace tracking id. */
  namespace?: string;
  source: ArgoCDAppCandidateSource;
}

/**
 * Parse `argocd.argoproj.io/tracking-id`, written by annotation-based tracking:
 * `<app>:<group>/<kind>:<namespace>/<name>`, where `<app>` is `<appNs>_<app>`
 * when the Application lives outside Argo CD's own namespace.
 */
export function parseArgoCDTrackingId(value: string | undefined): { name: string; namespace?: string } | null {
  if (!value) return null;
  const appPart = value.split(':')[0]?.trim();
  if (!appPart) return null;
  const separator = appPart.indexOf('_');
  if (separator > 0 && separator < appPart.length - 1) {
    return { namespace: appPart.slice(0, separator), name: appPart.slice(separator + 1) };
  }
  return { name: appPart };
}

/**
 * Every Application a workload could belong to, strongest signal first. A pod
 * carries the labels but not the tracking annotation, which is on its owning
 * Deployment/StatefulSet — so callers pass the whole owner chain.
 */
export function getWorkloadArgoCDCandidates(
  resources: Array<Pick<KubeResource, 'metadata'> | null | undefined>,
): ArgoCDAppCandidate[] {
  const candidates: ArgoCDAppCandidate[] = [];
  const seen = new Set<string>();
  const add = (candidate: ArgoCDAppCandidate) => {
    const key = `${candidate.namespace ?? ''}/${candidate.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const present = resources.filter((r): r is Pick<KubeResource, 'metadata'> => Boolean(r?.metadata));
  for (const resource of present) {
    const tracking = parseArgoCDTrackingId(resource.metadata.annotations?.[ARGOCD_TRACKING_ID_ANNOTATION]);
    if (tracking) add({ ...tracking, source: 'tracking-id' });
  }
  for (const resource of present) {
    const label = resource.metadata.labels?.[ARGOCD_INSTANCE_LABEL];
    if (label) add({ name: label, source: 'argocd-label' });
  }
  for (const resource of present) {
    // Also written by Helm itself, so on its own it only suggests Argo CD.
    const label = resource.metadata.labels?.[APP_INSTANCE_LABEL];
    if (label) add({ name: label, source: 'instance-label' });
  }
  return candidates;
}

/** Whether a candidate set is Argo-specific, rather than a Helm instance label alone. */
export function hasArgoCDSpecificCandidate(candidates: ArgoCDAppCandidate[]): boolean {
  return candidates.some((candidate) => candidate.source !== 'instance-label');
}

export interface ArgoCDHostApps {
  /** Cluster (kubeconfig context) the Application objects were listed from. */
  hostClusterId: string;
  apps: ArgoCDApplication[];
}

export interface WorkloadArgoCDMatch {
  hostClusterId: string;
  app: ArgoCDApplication;
  name: string;
  namespace: string;
  /** Another Application matched equally well; the pick may be wrong. */
  ambiguous: boolean;
}

function isInClusterDestination(app: ArgoCDApplication): boolean {
  const destination = app.spec?.destination;
  if (!destination) return false;
  if (destination.server) return destination.server.replace(/\/+$/, '') === IN_CLUSTER_SERVER;
  return destination.name === IN_CLUSTER_NAME;
}

function normalizeServer(server: string | undefined): string | undefined {
  return server ? server.replace(/\/+$/, '').toLowerCase() : undefined;
}

/**
 * Find the Application that manages a workload, across the cluster it runs in
 * and any clusters the user marked as running Argo CD.
 *
 * An Application on the workload's own cluster must target `in-cluster`; one on
 * a different host must not (it would be deploying to the host itself). Beyond
 * that, a destination namespace or server that matches the workload wins.
 */
export function findWorkloadArgoCDApp(params: {
  workloadClusterId: string;
  workloadNamespace?: string;
  /** API server URL of the workload's cluster, when known. */
  workloadServer?: string;
  candidates: ArgoCDAppCandidate[];
  hosts: ArgoCDHostApps[];
}): WorkloadArgoCDMatch | null {
  const { workloadClusterId, workloadNamespace, candidates, hosts } = params;
  const workloadServer = normalizeServer(params.workloadServer);
  const scored: Array<{ match: Omit<WorkloadArgoCDMatch, 'ambiguous'>; score: number }> = [];

  candidates.forEach((candidate, candidateIndex) => {
    for (const host of hosts) {
      const local = host.hostClusterId === workloadClusterId;
      for (const app of host.apps) {
        const name = app.metadata?.name;
        const namespace = app.metadata?.namespace;
        if (!name || !namespace || name !== candidate.name) continue;
        if (candidate.namespace && candidate.namespace !== namespace) continue;

        const inCluster = isInClusterDestination(app);
        const destinationServer = normalizeServer(app.spec?.destination?.server);
        const serverMatches = Boolean(workloadServer && destinationServer === workloadServer);
        if (local && !inCluster && !serverMatches) continue;
        if (!local && inCluster) continue;

        let score = 0;
        // Earlier candidates are stronger signals (tracking id > labels).
        score += (candidates.length - candidateIndex) * 10;
        if (serverMatches) score += 8;
        if (local) score += 4;
        if (workloadNamespace && app.spec?.destination?.namespace === workloadNamespace) score += 2;

        scored.push({ match: { hostClusterId: host.hostClusterId, app, name, namespace }, score });
      }
    }
  });

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scored;
  return { ...best.match, ambiguous: Boolean(runnerUp && runnerUp.score === best.score) };
}
