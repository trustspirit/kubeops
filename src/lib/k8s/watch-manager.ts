import * as k8s from '@kubernetes/client-node';
import { getKubeConfigForContext, invalidateKubeConfigCache } from './kubeconfig-manager';
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
  resourceType: string;
  namespace: string | undefined;
  abort: AbortController;
  callbacks: Set<WatchCallback>;
  resourceVersion: string;
  backoffMs: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
}

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

export interface WatchCursor {
  resourceVersion: string;
  backoffMs: number;
}

/** Whether a watch failure means "your resourceVersion is too old" (410 Gone). */
export function isResourceVersionExpired(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  // client-node 1.x sets `statusCode` for HTTP failures; Status objects and
  // some wrapped errors carry it in `code`.
  const v = value as { statusCode?: unknown; code?: unknown; body?: { code?: unknown } };
  return v.statusCode === 410 || v.code === 410 || v.body?.code === 410;
}

/**
 * Fold one stream event into the reconnect cursor.
 *
 * An expired resourceVersion usually arrives *in-stream* — a 200 response
 * whose first line is `{type: 'ERROR', object: Status{code: 410}}` — not as an
 * HTTP 410. Treating that like a normal event used to (a) keep the stale
 * resourceVersion, so every reconnect hit the same 410, and (b) reset the
 * backoff, so it did so in a tight 1s loop forever.
 */
export function applyWatchEvent(cursor: WatchCursor, phase: string, apiObj: unknown): WatchCursor {
  if (phase === 'ERROR') {
    // A Status object's metadata is not a resource cursor; never adopt it.
    return {
      resourceVersion: isResourceVersionExpired(apiObj) ? '' : cursor.resourceVersion,
      backoffMs: cursor.backoffMs,
    };
  }
  const metadata = (apiObj as { metadata?: { resourceVersion?: unknown } } | null)?.metadata;
  return {
    resourceVersion: metadata?.resourceVersion ? String(metadata.resourceVersion) : cursor.resourceVersion,
    backoffMs: MIN_BACKOFF,
  };
}

/** Delay for the next restart, and the backoff to store after it. */
export function nextBackoff(backoffMs: number): { delay: number; next: number } {
  return { delay: backoffMs, next: Math.min(backoffMs * 2, MAX_BACKOFF) };
}

/** Identity of the kubeconfig entries a watch actually depends on. */
function contextFingerprint(kc: k8s.KubeConfig): string {
  try {
    const contextName = kc.getCurrentContext();
    return JSON.stringify({
      context: kc.getContextObject(contextName),
      cluster: kc.getCurrentCluster(),
      user: kc.getCurrentUser(),
    });
  } catch {
    return '';
  }
}

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
      resourceType,
      namespace,
      abort: new AbortController(),
      callbacks: new Set([callback]),
      resourceVersion: '',
      backoffMs: MIN_BACKOFF,
      restartTimer: null,
    };
    this.watches.set(key, active);
    this.startWatch(key, active);
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
   * Re-read the kubeconfig and point running streams at it.
   *
   * Called after the kubeconfig changes (context edit, `aws eks
   * update-kubeconfig`, `tsh login`...). Shutting the manager down instead
   * left every open watch socket holding a dead manager whose `subscribe`
   * silently no-ops, so live updates stopped until the page was reloaded.
   *
   * When the context's cluster/user entries are unchanged, healthy streams
   * keep running; only streams sitting in error backoff retry immediately
   * (typically they were failing on the credentials the login just fixed).
   */
  reload(): void {
    if (this.isShutdown) return;

    let next: k8s.KubeConfig;
    try {
      // This module's kubeconfig cache may be a different instance from the
      // one the caller just invalidated (server bundle vs. Next bundle).
      invalidateKubeConfigCache();
      next = getKubeConfigForContext(this.clusterId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[WatchManager] Failed to reload kubeconfig for ${this.clusterId}:`, message);
      this.broadcastError(`Failed to reload kubeconfig: ${message}`);
      return;
    }

    const changed = contextFingerprint(next) !== contextFingerprint(this.kc);
    this.kc = next;

    for (const [key, active] of this.watches) {
      if (!changed && !active.restartTimer) continue;
      // Possibly a different cluster now: an old resourceVersion means nothing.
      if (changed) active.resourceVersion = '';
      active.backoffMs = MIN_BACKOFF;
      this.restartNow(key, active);
    }
  }

  /**
   * Shutdown all active watches and prevent new subscriptions.
   */
  shutdown(): void {
    this.isShutdown = true;
    for (const key of Array.from(this.watches.keys())) {
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

  /** True while `active`/`abort` are still the live stream for `key`. */
  private isCurrent(key: string, active: ActiveWatch, abort: AbortController): boolean {
    return !this.isShutdown && this.watches.get(key) === active && active.abort === abort;
  }

  private notify(active: ActiveWatch, event: WatchEvent): void {
    for (const cb of active.callbacks) {
      try { cb(event); } catch { /* ignore callback errors */ }
    }
  }

  private broadcastError(message: string): void {
    for (const active of this.watches.values()) {
      this.notify(active, { type: 'ERROR', object: { message } });
    }
  }

  /** Abort the current stream (if any) and start a fresh one right away. */
  private restartNow(key: string, active: ActiveWatch): void {
    if (active.restartTimer) {
      clearTimeout(active.restartTimer);
      active.restartTimer = null;
    }
    try { active.abort.abort(); } catch { /* already aborted */ }
    active.abort = new AbortController();
    this.startWatch(key, active);
  }

  private scheduleRestart(key: string, active: ActiveWatch): void {
    if (active.callbacks.size === 0) return;

    const { delay, next } = nextBackoff(active.backoffMs);
    active.backoffMs = next;
    console.log(`[WatchManager] Restarting watch for ${key} in ${delay}ms`);

    // Never stack timers: a stale one firing later would start a duplicate
    // stream alongside the one this timer starts.
    if (active.restartTimer) clearTimeout(active.restartTimer);
    // Retire the old controller so late callbacks from that stream are ignored.
    try { active.abort.abort(); } catch { /* already aborted */ }
    active.abort = new AbortController();
    active.restartTimer = setTimeout(() => {
      active.restartTimer = null;
      if (this.isShutdown || this.watches.get(key) !== active) return;
      this.startWatch(key, active);
    }, delay);
  }

  private async startWatch(key: string, active: ActiveWatch): Promise<void> {
    if (this.isShutdown || this.watches.get(key) !== active) return;
    const { resourceType, namespace } = active;

    let watchPath: string;
    try {
      watchPath = buildWatchPath(resourceType, namespace);
    } catch (err: unknown) {
      // Notify all callbacks of the error
      const errMsg = err instanceof Error ? err.message : String(err);
      this.notify(active, { type: 'ERROR', object: { message: errMsg } });
      return;
    }

    const watch = new k8s.Watch(this.kc);

    const queryParams: Record<string, string> = {};
    if (active.resourceVersion) {
      queryParams.resourceVersion = active.resourceVersion;
    }

    // Capture the controller that is live *now*. Every callback below checks
    // it is still current: a restart or reload swaps in a new controller, and
    // the old stream's late events or `done` must not touch the new one.
    const abort = active.abort;
    let finished = false;

    try {
      const req = await watch.watch(
        watchPath,
        queryParams,
        (phase: string, apiObj: Record<string, unknown>) => {
          if (finished || !this.isCurrent(key, active, abort)) return;

          const cursor = applyWatchEvent(active, phase, apiObj);
          active.resourceVersion = cursor.resourceVersion;
          active.backoffMs = cursor.backoffMs;

          this.notify(active, {
            type: phase as WatchEventType,
            object: apiObj as WatchEventObject,
          });
        },
        (err: unknown) => {
          // Watch stream ended — either error or normal close
          if (finished) return;
          finished = true;
          if (!this.isCurrent(key, active, abort)) return;

          if (!err && active.resourceVersion) {
            // Clean end of a healthy stream — restart promptly.
            active.backoffMs = MIN_BACKOFF;
          }

          if (err) {
            const watchErr = err as { message?: string; statusCode?: number; code?: number };
            console.error(`[WatchManager] Watch error for ${key} on cluster ${this.clusterId}:`, watchErr.message || err);

            // If 410 Gone, reset resourceVersion to start fresh
            if (isResourceVersionExpired(watchErr)) {
              active.resourceVersion = '';
            }

            this.notify(active, {
              type: 'ERROR',
              object: { message: watchErr.message || 'Watch stream error', code: watchErr.statusCode || watchErr.code },
            });
          }

          // Schedule restart with exponential backoff if there are still subscribers
          this.scheduleRestart(key, active);
        },
      );

      // Wire abort → request teardown. If the watch was already stopped while
      // `watch.watch` was in flight, the signal has fired and this aborts the
      // request immediately instead of leaking the connection forever.
      if (abort.signal.aborted || !this.isCurrent(key, active, abort)) {
        try { req.abort(); } catch { /* already aborted */ }
        return;
      }
      abort.signal.addEventListener('abort', () => {
        try { req.abort(); } catch { /* already aborted */ }
      }, { once: true });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[WatchManager] Failed to start watch for ${key}:`, errMsg);

      if (finished) return;
      finished = true;
      if (!this.isCurrent(key, active, abort)) return;

      this.notify(active, { type: 'ERROR', object: { message: errMsg || 'Failed to start watch' } });
      this.scheduleRestart(key, active);
    }
  }
}

// --- Singleton registry ---

const REGISTRY_KEY = Symbol.for('kubeops.watchManagers');

/**
 * The registry lives on `globalThis`, like the port-forward registry: the
 * WebSocket handlers run in the server bundle while kubeconfig invalidation
 * runs inside the Next-loaded route modules. A module-level Map existed once
 * per bundle, so invalidation from an API route never reached the managers
 * that were actually serving watches.
 */
function registry(): Map<string, WatchManager> {
  const store = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Map<string, WatchManager> };
  if (!store[REGISTRY_KEY]) store[REGISTRY_KEY] = new Map();
  return store[REGISTRY_KEY];
}

/**
 * Get or create a WatchManager singleton for a given cluster context.
 * Throws if the kubeconfig cannot be loaded (e.g. half-written file).
 */
export function getWatchManager(clusterId: string): WatchManager {
  const watchManagers = registry();
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
  const watchManagers = registry();
  const manager = watchManagers.get(clusterId);
  if (manager) {
    console.log(`[WatchManager] Shutting down manager for cluster: ${clusterId}`);
    manager.shutdown();
    watchManagers.delete(clusterId);
  }
}

/**
 * Reload every manager's kubeconfig after it changed on disk. Managers stay
 * registered so existing WebSocket handlers keep working.
 */
export function reloadAllWatchManagers(): void {
  for (const manager of registry().values()) {
    manager.reload();
  }
}

/**
 * Shutdown all WatchManagers and clear the registry.
 * Call this on server shutdown.
 */
export function shutdownAllWatchManagers(): void {
  const watchManagers = registry();
  console.log(`[WatchManager] Shutting down all watch managers (${watchManagers.size} active)`);
  for (const [clusterId, manager] of watchManagers) {
    console.log(`[WatchManager] Shutting down manager for cluster: ${clusterId}`);
    manager.shutdown();
  }
  watchManagers.clear();
}
