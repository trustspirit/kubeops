import type { ArgoCDApplication } from './helpers';

/**
 * What the workload bar needs from an Application read through the Argo CD
 * server (`argocd app get`), for when the Application object is not reachable
 * through any kubeconfig context — e.g. a root Argo CD at argocd-root.ovdr.io
 * managing central-ea.
 */
export interface ArgoCDServerAppSummary {
  name: string;
  namespace: string;
  project?: string;
  syncStatus?: string;
  healthStatus?: string;
  destinationServer?: string;
  destinationName?: string;
  destinationNamespace?: string;
}

export function summarizeServerApp(app: ArgoCDApplication): ArgoCDServerAppSummary {
  return {
    name: app.metadata?.name,
    namespace: app.metadata?.namespace || '',
    project: app.spec?.project,
    syncStatus: app.status?.sync?.status,
    healthStatus: app.status?.health?.status,
    destinationServer: app.spec?.destination?.server,
    destinationName: app.spec?.destination?.name,
    destinationNamespace: app.spec?.destination?.namespace,
  };
}

export type ArgoCDCliErrorKind = 'auth' | 'not-found' | 'other';

/**
 * Argo CD answers "permission denied" for an app that does not exist (so its
 * existence is not leaked), which for a lookup means the same as not found.
 */
export function classifyArgoCDCliError(message: string): ArgoCDCliErrorKind {
  // An expired SSO refresh token surfaces as an OAuth error from the CLI
  // (Azure AD: `oauth2: "invalid_grant" … AADSTS700082 … refresh token has expired`).
  if (/not logged in|please login|Unauthenticated|invalid session|token is expired|expired token|no session information|invalid_grant|refresh token has expired/i.test(message)) {
    return 'auth';
  }
  if (/not found|NotFound|permission denied|PermissionDenied/i.test(message)) {
    return 'not-found';
  }
  return 'other';
}

/** `argocd app get` addresses an app outside Argo CD's namespace as `ns/name`. */
export function toArgoCDAppRef(name: string, namespace?: string): string {
  return namespace ? `${namespace}/${name}` : name;
}

/** Web UI link for an Application on an Argo CD server host such as `argocd-root.ovdr.io`. */
export function getArgoCDServerAppUrl(server: string, app: Pick<ArgoCDServerAppSummary, 'name' | 'namespace'>): string {
  const base = /^https?:\/\//i.test(server) ? server.replace(/\/+$/, '') : `https://${server}`;
  const path = app.namespace
    ? `${encodeURIComponent(app.namespace)}/${encodeURIComponent(app.name)}`
    : encodeURIComponent(app.name);
  return `${base}/applications/${path}`;
}
