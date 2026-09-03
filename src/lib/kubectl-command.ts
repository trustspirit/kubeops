/**
 * Generate kubectl command strings for common operations.
 */

interface CommandContext {
  context?: string;
  namespace?: string;
}

function contextFlags(ctx?: CommandContext): string {
  const parts: string[] = [];
  if (ctx?.context) parts.push(`--context ${ctx.context}`);
  if (ctx?.namespace) parts.push(`-n ${ctx.namespace}`);
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

/**
 * Convert a plural resource type to singular form.
 */
export function singularize(resourceType: string): string {
  const map: Record<string, string> = {
    pods: 'pod',
    deployments: 'deployment',
    services: 'service',
    configmaps: 'configmap',
    secrets: 'secret',
    ingresses: 'ingress',
    statefulsets: 'statefulset',
    daemonsets: 'daemonset',
    replicasets: 'replicaset',
    jobs: 'job',
    cronjobs: 'cronjob',
    nodes: 'node',
    pvs: 'pv',
    pvcs: 'pvc',
    serviceaccounts: 'serviceaccount',
    roles: 'role',
    rolebindings: 'rolebinding',
    clusterroles: 'clusterrole',
    clusterrolebindings: 'clusterrolebinding',
    networkpolicies: 'networkpolicy',
    events: 'event',
    endpoints: 'endpoints',
    namespaces: 'namespace',
    persistentvolumes: 'persistentvolume',
    persistentvolumeclaims: 'persistentvolumeclaim',
    resourcequotas: 'resourcequota',
    limitranges: 'limitrange',
    horizontalpodautoscalers: 'horizontalpodautoscaler',
    verticalpodautoscalers: 'verticalpodautoscaler',
    poddisruptionbudgets: 'poddisruptionbudget',
    storageclasses: 'storageclass',
    customresourcedefinitions: 'customresourcedefinition',
  };
  if (map[resourceType]) return map[resourceType];

  // Fall back to English plural rules rather than chopping the last character,
  // which turns "ingresses" into "ingresse" and "policies" into "policie".
  if (/(ses|xes|zes|ches|shes)$/.test(resourceType)) return resourceType.slice(0, -2);
  if (/ies$/.test(resourceType)) return `${resourceType.slice(0, -3)}y`;
  if (/[^s]s$/.test(resourceType)) return resourceType.slice(0, -1);
  return resourceType;
}

export function kubectlGet(
  resourceType: string,
  name?: string,
  ctx?: CommandContext
): string {
  const singular = singularize(resourceType);
  const resource = name ? `${singular} ${name}` : singular;
  return `kubectl get ${resource}${contextFlags(ctx)}`;
}

export function kubectlDelete(
  resourceType: string,
  name: string,
  ctx?: CommandContext
): string {
  const singular = singularize(resourceType);
  return `kubectl delete ${singular} ${name}${contextFlags(ctx)}`;
}

export function kubectlScale(
  resourceType: string,
  name: string,
  replicas: number,
  ctx?: CommandContext
): string {
  const singular = singularize(resourceType);
  return `kubectl scale ${singular} ${name} --replicas=${replicas}${contextFlags(ctx)}`;
}

export function kubectlExec(
  podName: string,
  command: string = '/bin/sh',
  ctx?: CommandContext
): string {
  return `kubectl exec -it${contextFlags(ctx)} ${podName} -- ${command}`;
}

export function kubectlLogs(
  podName: string,
  ctx?: CommandContext,
  options?: { follow?: boolean; container?: string; tail?: number }
): string {
  let cmd = `kubectl logs ${podName}`;
  if (options?.container) cmd += ` -c ${options.container}`;
  if (options?.follow) cmd += ' -f';
  if (options?.tail !== undefined) cmd += ` --tail=${options.tail}`;
  cmd += contextFlags(ctx);
  return cmd;
}

export function kubectlPortForward(
  resourceType: string,
  name: string,
  localPort: number,
  remotePort: number,
  ctx?: CommandContext
): string {
  const singular = singularize(resourceType);
  return `kubectl port-forward ${singular}/${name} ${localPort}:${remotePort}${contextFlags(ctx)}`;
}

export function kubectlApply(
  filename: string,
  ctx?: CommandContext
): string {
  return `kubectl apply -f ${filename}${contextFlags(ctx)}`;
}

export function kubectlRestart(
  resourceType: string,
  name: string,
  ctx?: CommandContext
): string {
  const singular = singularize(resourceType);
  return `kubectl rollout restart ${singular} ${name}${contextFlags(ctx)}`;
}
