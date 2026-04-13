/**
 * Guards non-interactive operations (health checks) from triggering
 * Teleport's auto-relogin browser flow.
 *
 * When tsh kube credentials is invoked by the @kubernetes/client-node
 * exec auth plugin and the Teleport session is expired, recent Teleport
 * versions (14+) may automatically open a browser for re-authentication.
 * This repeats on every health-check cycle (~30 s), flooding the user
 * with browser tabs.
 *
 * The guard caches `tsh status` results and exposes a predicate so that
 * callers can skip the k8s API call (and thus the exec plugin) for
 * Teleport-managed contexts when the session is invalid.
 */

import * as k8s from '@kubernetes/client-node';
import { findCli, runCli } from '../auth/cli-utils';

// ---------------------------------------------------------------------------
// Teleport context detection (cached per context name)
// ---------------------------------------------------------------------------

const teleportContextCache = new Map<string, boolean>();

/**
 * Returns true if the kubeconfig user for `contextName` uses an exec
 * credential plugin whose command contains "tsh".
 */
export function isTeleportContext(contextName: string): boolean {
  const cached = teleportContextCache.get(contextName);
  if (cached !== undefined) return cached;

  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    kc.setCurrentContext(contextName);
    const user = kc.getCurrentUser();
    const cmd = user?.exec?.command ?? '';
    const args = user?.exec?.args ?? [];
    const result = cmd.includes('tsh') || args.some((a: string) => a.includes('tsh'));
    teleportContextCache.set(contextName, result);
    return result;
  } catch {
    return false;
  }
}

/** Call after kubeconfig changes (e.g. new login) to re-evaluate contexts. */
export function clearTeleportContextCache(): void {
  teleportContextCache.clear();
}

// ---------------------------------------------------------------------------
// Teleport session validity (cached with TTL)
// ---------------------------------------------------------------------------

let sessionCache: { valid: boolean; checkedAt: number } | null = null;
const SESSION_CACHE_TTL = 30_000; // 30 s — matches the cluster SWR refresh

/**
 * Checks whether the current Teleport session is valid by running
 * `tsh status --format=json`. The result is cached for SESSION_CACHE_TTL.
 *
 * Uses execFileSync (blocking, max 10 s) — acceptable because the call is
 * cheap and we only run it once per health-check cycle thanks to caching.
 *
 * On failure (timeout, parse error), preserves the previous cached value
 * to avoid falsely marking a valid session as expired.
 */
export function isTshSessionValid(): boolean {
  if (sessionCache && Date.now() - sessionCache.checkedAt < SESSION_CACHE_TTL) {
    return sessionCache.valid;
  }

  const path = findCli('tsh');
  if (!path) {
    sessionCache = { valid: false, checkedAt: Date.now() };
    return false;
  }

  try {
    const output = runCli(path, ['status', '--format=json'], 10_000);
    const data = JSON.parse(output);
    const active = data?.active;
    // Check both username presence and session expiry — tsh status can return
    // the user even after the session has expired.
    let valid = !!active?.username;
    if (valid && active.valid_until) {
      const expiry = new Date(active.valid_until).getTime();
      if (expiry > 0 && expiry < Date.now()) valid = false;
    }
    sessionCache = { valid, checkedAt: Date.now() };
    return valid;
  } catch {
    // On failure, preserve previous state — don't flip a valid session to invalid
    // just because tsh was temporarily slow or busy.
    // Update checkedAt to avoid retry storms when tsh is consistently slow.
    if (sessionCache) {
      sessionCache = { ...sessionCache, checkedAt: Date.now() };
      return sessionCache.valid;
    }
    return false;
  }
}

/**
 * Force the next `isTshSessionValid()` call to re-run `tsh status`.
 * Call this after a successful `tsh login`.
 */
export function invalidateTshSessionCache(): void {
  sessionCache = null;
}
