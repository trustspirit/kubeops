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
  // Guard: skip the k8s API call (and its exec auth plugin) for Teleport
  // contexts when the session is expired — this prevents tsh from opening
  // a browser for auto-relogin on every health-check cycle.
  if (isTeleportContext(contextName) && !isTshSessionValid()) {
    const entry: StatusEntry = {
      status: 'disconnected',
      error: 'Teleport session expired',
      checkedAt: Date.now(),
    };
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

export async function refreshStatusesInBackground(contextNames: string[]): Promise<void> {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    await Promise.all(contextNames.map(checkClusterStatus));
  } finally {
    refreshInProgress = false;
  }
}
