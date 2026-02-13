import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext } from './kubeconfig-manager';
import type { WatchEvent, WatchEventType, WatchEventObject } from '@/types/watch';

export type WatchCallback = (event: WatchEvent) => void;

/**
 * Maps resourceType to the Kubernetes API watch path.
 * Namespaced resources will have the namespace inserted into the path.
 */
const RESOURCE_PATH_MAP: Record<string, { basePath: string; namespaced: boolean }> = {
  // CoreV1Api resources (namespaced)
  pods:             { basePath: '/api/v1', namespaced: true },
  services:         { basePath: '/api/v1', namespaced: true },
  configmaps:       { basePath: '/api/v1', namespaced: true },
  secrets:          { basePath: '/api/v1', namespaced: true },
  endpoints:        { basePath: '/api/v1', namespaced: true },
  serviceaccounts:  { basePath: '/api/v1', namespaced: true },
  persistentvolumeclaims: { basePath: '/api/v1', namespaced: true },
  pvcs:             { basePath: '/api/v1', namespaced: true },
  events:           { basePath: '/api/v1', namespaced: true },
  resourcequotas:   { basePath: '/api/v1', namespaced: true },
  limitranges:      { basePath: '/api/v1', namespaced: true },

  // AppsV1Api resources (namespaced)
  deployments:  { basePath: '/apis/apps/v1', namespaced: true },
  statefulsets: { basePath: '/apis/apps/v1', namespaced: true },
  daemonsets:   { basePath: '/apis/apps/v1', namespaced: true },
  replicasets:  { basePath: '/apis/apps/v1', namespaced: true },

  // BatchV1Api resources (namespaced)
  jobs:     { basePath: '/apis/batch/v1', namespaced: true },
  cronjobs: { basePath: '/apis/batch/v1', namespaced: true },

  // NetworkingV1Api resources (namespaced)
  ingresses:       { basePath: '/apis/networking.k8s.io/v1', namespaced: true },
  networkpolicies: { basePath: '/apis/networking.k8s.io/v1', namespaced: true },

  // RbacAuthorizationV1Api resources (namespaced)
  roles:        { basePath: '/apis/rbac.authorization.k8s.io/v1', namespaced: true },
  rolebindings: { basePath: '/apis/rbac.authorization.k8s.io/v1', namespaced: true },

  // AutoscalingV2 resources (namespaced)
  horizontalpodautoscalers: { basePath: '/apis/autoscaling/v2', namespaced: true },

  // Cluster-scoped resources
  nodes:               { basePath: '/api/v1', namespaced: false },
  namespaces:          { basePath: '/api/v1', namespaced: false },
  persistentvolumes:   { basePath: '/api/v1', namespaced: false },
  pvs:                 { basePath: '/api/v1', namespaced: false },
  clusterroles:        { basePath: '/apis/rbac.authorization.k8s.io/v1', namespaced: false },
  clusterrolebindings: { basePath: '/apis/rbac.authorization.k8s.io/v1', namespaced: false },
};

/** Canonical resource name — handle aliases */
function canonicalResource(resourceType: string): string {
  // Map common aliases
  if (resourceType === 'pvcs') return 'persistentvolumeclaims';
  if (resourceType === 'pvs') return 'persistentvolumes';
  return resourceType;
}

/** Build the Watch API path for a given resource type and optional namespace */
function buildWatchPath(resourceType: string, namespace?: string): string {
  const canonical = canonicalResource(resourceType);
  const mapping = RESOURCE_PATH_MAP[canonical] || RESOURCE_PATH_MAP[resourceType];
  if (!mapping) {
    throw new Error(`Unknown resource type: ${resourceType}`);
  }

  const resourceName = canonical;

  if (mapping.namespaced && namespace) {
    return `${mapping.basePath}/namespaces/${namespace}/${resourceName}`;
  }
  // Cluster-scoped or all-namespaces watch
  return `${mapping.basePath}/${resourceName}`;
}

/** Key for identifying a unique watch stream */
function watchKey(resourceType: string, namespace?: string): string {
  const canonical = canonicalResource(resourceType);
  return namespace ? `${canonical}:${namespace}` : `${canonical}:_cluster_`;
}

interface ActiveWatch {
  abort: AbortController;
  callbacks: Set<WatchCallback>;
  resourceVersion: string;
  backoffMs: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
}

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

export class WatchManager {
  private clusterId: string;
  private kc: k8s.KubeConfig;
  private watches: Map<string, ActiveWatch> = new Map();
  private isShutdown = false;

  constructor(clusterId: string) {
    this.clusterId = clusterId;
    this.kc = getKubeConfigForContext(clusterId);
  }

  /**
   * Subscribe to watch events for a resource type in an optional namespace.
   * Starts a K8s Watch stream if one is not already running.
   */
  subscribe(resourceType: string, namespace: string | undefined, callback: WatchCallback): void {
    if (this.isShutdown) return;

    const key = watchKey(resourceType, namespace);
    let active = this.watches.get(key);

    if (active) {
      active.callbacks.add(callback);
      return;
    }

    // Create a new active watch
    active = {
      abort: new AbortController(),
      callbacks: new Set([callback]),
      resourceVersion: '',
      backoffMs: MIN_BACKOFF,
      restartTimer: null,
    };
    this.watches.set(key, active);
    this.startWatch(resourceType, namespace, key);
  }

  /**
   * Unsubscribe a callback. If no more subscribers, stop the Watch stream.
   */
  unsubscribe(resourceType: string, namespace: string | undefined, callback: WatchCallback): void {
    const key = watchKey(resourceType, namespace);
    const active = this.watches.get(key);
    if (!active) return;

    active.callbacks.delete(callback);

    if (active.callbacks.size === 0) {
      this.stopWatch(key);
    }
  }

  /**
   * Shutdown all active watches and prevent new subscriptions.
   */
  shutdown(): void {
    this.isShutdown = true;
    for (const key of this.watches.keys()) {
      this.stopWatch(key);
    }
    this.watches.clear();
  }

  private stopWatch(key: string): void {
    const active = this.watches.get(key);
    if (!active) return;

    if (active.restartTimer) {
      clearTimeout(active.restartTimer);
      active.restartTimer = null;
    }
    try {
      active.abort.abort();
    } catch {
      /* already aborted */
    }
    this.watches.delete(key);
  }

  private async startWatch(resourceType: string, namespace: string | undefined, key: string): Promise<void> {
    const active = this.watches.get(key);
    if (!active || this.isShutdown) return;

    let watchPath: string;
    try {
      watchPath = buildWatchPath(resourceType, namespace);
    } catch (err: unknown) {
      // Notify all callbacks of the error
      const errMsg = err instanceof Error ? err.message : String(err);
      const errorEvent: WatchEvent = {
        type: 'ERROR',
        object: { message: errMsg },
      };
      for (const cb of active.callbacks) {
        try { cb(errorEvent); } catch { /* ignore */ }
      }
      return;
    }

    const watch = new k8s.Watch(this.kc);

    const queryParams: Record<string, string> = {};
    if (active.resourceVersion) {
      queryParams.resourceVersion = active.resourceVersion;
    }

    try {
      const req = await watch.watch(
        watchPath,
        queryParams,
        (phase: string, apiObj: Record<string, unknown>) => {
          if (this.isShutdown) return;

          const currentActive = this.watches.get(key);
          if (!currentActive) return;

          // Track resourceVersion for reconnection
          const metadata = apiObj?.metadata as Record<string, unknown> | undefined;
          if (metadata?.resourceVersion) {
            currentActive.resourceVersion = String(metadata.resourceVersion);
          }

          // Reset backoff on successful event
          currentActive.backoffMs = MIN_BACKOFF;

          const event: WatchEvent = {
            type: phase as WatchEventType,
            object: apiObj as WatchEventObject,
          };

          for (const cb of currentActive.callbacks) {
            try { cb(event); } catch { /* ignore callback errors */ }
          }
        },
        (err: unknown) => {
          // Watch stream ended — either error or normal close
          if (this.isShutdown) return;

          const currentActive = this.watches.get(key);
          if (!currentActive) return;

          if (err) {
            const watchErr = err as { message?: string; statusCode?: number; code?: number };
            console.error(`[WatchManager] Watch error for ${key} on cluster ${this.clusterId}:`, watchErr.message || err);

            // If 410 Gone, reset resourceVersion to start fresh
            if (watchErr.statusCode === 410 || watchErr.code === 410) {
              currentActive.resourceVersion = '';
            }

            // Notify callbacks of error
            const errorEvent: WatchEvent = {
              type: 'ERROR',
              object: { message: watchErr.message || 'Watch stream error', code: watchErr.statusCode || watchErr.code },
            };
            for (const cb of currentActive.callbacks) {
              try { cb(errorEvent); } catch { /* ignore */ }
            }
          }

          // Schedule restart with exponential backoff if there are still subscribers
          if (currentActive.callbacks.size > 0) {
            const delay = currentActive.backoffMs;
            currentActive.backoffMs = Math.min(currentActive.backoffMs * 2, MAX_BACKOFF);

            console.log(`[WatchManager] Restarting watch for ${key} in ${delay}ms`);

            // Create new abort controller for the restart
            currentActive.abort = new AbortController();
            currentActive.restartTimer = setTimeout(() => {
              currentActive.restartTimer = null;
              this.startWatch(resourceType, namespace, key);
            }, delay);
          }
        },
      );

      // Store the request so we can abort it
      const currentActive = this.watches.get(key);
      if (currentActive) {
        // When abort is signalled, destroy the underlying request
        currentActive.abort.signal.addEventListener('abort', () => {
          try { req.abort(); } catch { /* already aborted */ }
        }, { once: true });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[WatchManager] Failed to start watch for ${key}:`, errMsg);

      const currentActive = this.watches.get(key);
      if (!currentActive || this.isShutdown) return;

      // Notify callbacks of the error
      const errorEvent: WatchEvent = {
        type: 'ERROR',
        object: { message: errMsg || 'Failed to start watch' },
      };
      for (const cb of currentActive.callbacks) {
        try { cb(errorEvent); } catch { /* ignore */ }
      }

      // Schedule restart with backoff
      if (currentActive.callbacks.size > 0) {
        const delay = currentActive.backoffMs;
        currentActive.backoffMs = Math.min(currentActive.backoffMs * 2, MAX_BACKOFF);

        currentActive.abort = new AbortController();
        currentActive.restartTimer = setTimeout(() => {
          currentActive.restartTimer = null;
          this.startWatch(resourceType, namespace, key);
        }, delay);
      }
    }
  }
}

// --- Singleton registry ---

const watchManagers = new Map<string, WatchManager>();

/**
 * Get or create a WatchManager singleton for a given cluster context.
 */
export function getWatchManager(clusterId: string): WatchManager {
  let manager = watchManagers.get(clusterId);
  if (!manager) {
    manager = new WatchManager(clusterId);
    watchManagers.set(clusterId, manager);
    console.log(`[WatchManager] Created manager for cluster: ${clusterId}`);
  }
  return manager;
}

/**
 * Shutdown and remove a single WatchManager from the registry.
 * Call this when a cluster is disconnected or removed.
 */
export function shutdownWatchManager(clusterId: string): void {
  const manager = watchManagers.get(clusterId);
  if (manager) {
    console.log(`[WatchManager] Shutting down manager for cluster: ${clusterId}`);
    manager.shutdown();
    watchManagers.delete(clusterId);
  }
}

/**
 * Shutdown all WatchManagers and clear the registry.
 * Call this on server shutdown.
 */
export function shutdownAllWatchManagers(): void {
  console.log(`[WatchManager] Shutting down all watch managers (${watchManagers.size} active)`);
  for (const [clusterId, manager] of watchManagers) {
    console.log(`[WatchManager] Shutting down manager for cluster: ${clusterId}`);
    manager.shutdown();
  }
  watchManagers.clear();
}
