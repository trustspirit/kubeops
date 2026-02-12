import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from './kubeconfig-manager';

interface CachedClient {
  client: unknown;
  createdAt: number;
}

const CLIENT_CACHE_TTL = 60_000; // 1 minute - short TTL for Teleport exec credential compatibility
const clientCache = new Map<string, Map<string, CachedClient>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getApiClient<T>(contextName: string, ApiClass: any): T {
  if (!clientCache.has(contextName)) {
    clientCache.set(contextName, new Map());
  }
  const contextClients = clientCache.get(contextName)!;
  const className = ApiClass.name || String(ApiClass);
  const cached = contextClients.get(className);

  if (cached && Date.now() - cached.createdAt < CLIENT_CACHE_TTL) {
    return cached.client as T;
  }

  const kc = getKubeConfigForContext(contextName);
  const client = kc.makeApiClient(ApiClass);
  contextClients.set(className, { client, createdAt: Date.now() });
  return client as T;
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

export function getAuthorizationV1Api(contextName: string) {
  return getApiClient<k8s.AuthorizationV1Api>(contextName, k8s.AuthorizationV1Api);
}
