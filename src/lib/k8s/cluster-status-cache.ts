import { getCoreV1Api } from './client-factory';
import { isTeleportContext, isTshSessionValid } from './tsh-session-guard';

interface StatusEntry {
  status: 'connected' | 'error' | 'disconnected';
  error?: string;
  checkedAt: number;
}

const STATUS_CACHE_TTL = 60_000; // 60s before re-checking
const HEALTH_CHECK_TIMEOUT = 5_000; // 5s timeout per cluster

const statusCache = new Map<string, StatusEntry>();
let refreshInProgress = false;

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

export function getCachedStatus(contextName: string): StatusEntry | null {
  return statusCache.get(contextName) ?? null;
}

export function isStatusStale(contextName: string): boolean {
  const entry = statusCache.get(contextName);
  return !entry || Date.now() - entry.checkedAt > STATUS_CACHE_TTL;
}

export async function checkClusterStatus(contextName: string): Promise<StatusEntry> {
  // Teleport clusters: NEVER invoke the K8s API during background health checks.
  // Even with a valid session, the exec plugin (tsh kube credentials) can trigger
  // browser-based per-cluster re-authorization in Teleport 14+, opening a new
  // browser tab on every health-check cycle for every cluster.
  // Instead, use tsh session validity as a proxy for cluster reachability.
  if (isTeleportContext(contextName)) {
    const valid = isTshSessionValid();
    const entry: StatusEntry = valid
      ? { status: 'connected', checkedAt: Date.now() }
      : { status: 'disconnected', error: 'Teleport session expired', checkedAt: Date.now() };
    statusCache.set(contextName, entry);
    return entry;
  }

  try {
    const api = getCoreV1Api(contextName);
    await Promise.race([
      api.getAPIResources(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), HEALTH_CHECK_TIMEOUT)
      ),
    ]);
    const entry: StatusEntry = { status: 'connected', checkedAt: Date.now() };
    statusCache.set(contextName, entry);
    return entry;
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Connection failed';
    const entry: StatusEntry = {
      status: 'error',
      error: stripAnsi(raw),
      checkedAt: Date.now(),
    };
    statusCache.set(contextName, entry);
    return entry;
  }
}

export function clearStatusCache(contextName?: string): void {
  if (contextName) {
    statusCache.delete(contextName);
  } else {
    statusCache.clear();
  }
}

/** Run promises with limited concurrency */
async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;
  const run = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => run()));
  return results;
}

const MAX_CONCURRENT_CHECKS = 5;

export async function refreshStatusesInBackground(contextNames: string[]): Promise<void> {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    // Limit concurrency to prevent overwhelming exec credential plugins
    // (e.g. tsh kube credentials) when many Teleport clusters check at once.
    await pLimit(
      contextNames.map((name) => () => checkClusterStatus(name)),
      MAX_CONCURRENT_CHECKS,
    );
  } finally {
    refreshInProgress = false;
  }
}
