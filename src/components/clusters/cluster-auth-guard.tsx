'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ensureTshKubeLogin, isTshKubeLoginRecent } from '@/lib/auth/tsh-kube-login-cache';

/**
 * Defense-in-depth wrapper for any page under `/clusters/[clusterId]/*`.
 *
 * Background:
 * The cluster-list status check for Teleport clusters only verifies the proxy
 * session (`tsh status`); it cannot confirm per-cluster credentials. If the
 * user reaches a cluster page from any entry point that does NOT pre-run
 * `tsh kube login <cluster>` (command palette, sidebar bookmarks, multi-cluster
 * overview cards, the in-app router fallback, etc.), the page's SWR/WebSocket
 * fan-out will fail with authentication errors.
 *
 * This guard runs `ensureTshKubeLogin` ONCE on mount before rendering the
 * cluster-scoped tree. When the in-session cache is already hot (the common
 * case after the user clicked through the cluster list), no fetch is issued
 * and the children render synchronously — there is no perceptible delay.
 *
 * For non-Teleport providers `ensureTshKubeLogin` is a no-op detect call.
 */
export function ClusterAuthGuard({ children }: { children: ReactNode }) {
  const params = useParams();
  const clusterId = params?.clusterId ? decodeURIComponent(params.clusterId as string) : null;

  // Synchronously skip blocking when the cache is hot, so direct navigations
  // from the (already-fixed) cluster list page render with zero overhead.
  const [ready, setReady] = useState(() => !clusterId || isTshKubeLoginRecent(clusterId));

  useEffect(() => {
    if (!clusterId) {
      setReady(true);
      return;
    }
    if (isTshKubeLoginRecent(clusterId)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        await ensureTshKubeLogin(clusterId);
      } catch {
        // Surface the error via the cluster page's own ErrorDisplay rather
        // than blocking the layout — children still render and the per-cluster
        // SWR call will produce a 401 → ErrorDisplay shows the Login button.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  if (!ready) {
    return (
      <div className="flex h-full min-h-[60vh] w-full items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Authenticating cluster…</span>
      </div>
    );
  }

  return <>{children}</>;
}
