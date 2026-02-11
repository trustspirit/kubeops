import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from './kubeconfig-manager';

const clientCache = new Map<string, Map<string, unknown>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getApiClient<T>(contextName: string, ApiClass: any): T {
  if (!clientCache.has(contextName)) {
    clientCache.set(contextName, new Map());
  }
  const contextClients = clientCache.get(contextName)!;
  const className = ApiClass.name || String(ApiClass);

  if (!contextClients.has(className)) {
    const kc = getKubeConfigForContext(contextName);
    const client = kc.makeApiClient(ApiClass);
    contextClients.set(className, client);
  }
  return contextClients.get(className) as T;
}

export function clearClientCache(contextName?: string) {
  if (contextName) {
    clientCache.delete(contextName);
  } else {
    clientCache.clear();
  }
}

export function getCoreV1Api(contextName: string) {
  return getApiClient<k8s.CoreV1Api>(contextName, k8s.CoreV1Api);
}

export function getAppsV1Api(contextName: string) {
  return getApiClient<k8s.AppsV1Api>(contextName, k8s.AppsV1Api);
}

export function getBatchV1Api(contextName: string) {
  return getApiClient<k8s.BatchV1Api>(contextName, k8s.BatchV1Api);
}

export function getNetworkingV1Api(contextName: string) {
  return getApiClient<k8s.NetworkingV1Api>(contextName, k8s.NetworkingV1Api);
}

export function getRbacV1Api(contextName: string) {
  return getApiClient<k8s.RbacAuthorizationV1Api>(contextName, k8s.RbacAuthorizationV1Api);
}
