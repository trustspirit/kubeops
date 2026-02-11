import * as k8s from '@kubernetes/client-node';

let cachedKubeConfig: k8s.KubeConfig | null = null;
let lastLoadTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export function loadKubeConfig(): k8s.KubeConfig {
  const now = Date.now();
  if (cachedKubeConfig && now - lastLoadTime < CACHE_TTL) {
    return cachedKubeConfig;
  }
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  cachedKubeConfig = kc;
  lastLoadTime = now;
  return kc;
}

export function getContexts(): k8s.Context[] {
  const kc = loadKubeConfig();
  return kc.getContexts();
}

export function getKubeConfigForContext(contextName: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  kc.setCurrentContext(contextName);
  return kc;
}

export function getClusterServer(contextName: string): string | undefined {
  const kc = loadKubeConfig();
  const context = kc.getContexts().find(c => c.name === contextName);
  if (!context) return undefined;
  const cluster = kc.getClusters().find(c => c.name === context.cluster);
  return cluster?.server;
}

export function getContextNamespace(contextName: string): string | undefined {
  const kc = loadKubeConfig();
  const context = kc.getContexts().find(c => c.name === contextName);
  return context?.namespace || undefined;
}
