'use client';

import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ExternalLink, GitBranch, Loader2, LogIn, RefreshCw, RotateCw } from 'lucide-react';
import { apiClient, LONG_RUNNING_TIMEOUT_MS } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import type { ArgoCDAppCandidate } from '@/lib/argocd/workload-app';
import { getArgoCDServerAppUrl, type ArgoCDServerAppSummary } from '@/lib/argocd/server-app';

/** At most this many `argocd app get` lookups per workload page. */
const MAX_LOOKUPS = 3;

interface ArgoCDServerAppBarProps {
  /** Argo CD server host from Settings > Auth Providers, e.g. argocd-root.ovdr.io. */
  server: string;
  candidates: ArgoCDAppCandidate[];
  /** Rendered when no candidate exists on the server (null to stay hidden). */
  notFound: ReactNode;
  /** Extra controls (e.g. the Argo CD cluster picker) shown at the end of the bar. */
  trailing?: ReactNode;
}

type Lookup =
  | { state: 'found'; app: ArgoCDServerAppSummary }
  | { state: 'not-found' }
  | { state: 'needs-login'; message: string }
  | { state: 'error'; message: string };

function appUrl(name: string, server: string, namespace?: string): string {
  const query = new URLSearchParams({ server });
  if (namespace) query.set('namespace', namespace);
  return `/api/argocd/apps/${encodeURIComponent(name)}?${query}`;
}

async function lookupOnServer(server: string, candidates: ArgoCDAppCandidate[]): Promise<Lookup> {
  for (const candidate of candidates.slice(0, MAX_LOOKUPS)) {
    try {
      const { app } = await apiClient.get<{ app: ArgoCDServerAppSummary }>(appUrl(candidate.name, server, candidate.namespace));
      return { state: 'found', app };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : 'Request failed';
      if (status === 404) continue;
      if (status === 401) return { state: 'needs-login', message };
      return { state: 'error', message };
    }
  }
  return { state: 'not-found' };
}

/**
 * Fallback for {@link ArgoCDWorkloadBar}: when no kubeconfig context exposes
 * the Application object, find and refresh it through the Argo CD server.
 */
export function ArgoCDServerAppBar({ server, candidates, notFound, trailing }: ArgoCDServerAppBarProps) {
  const [pending, setPending] = useState<'normal' | 'hard' | 'login' | null>(null);
  const { data, mutate, isLoading } = useSWR(
    ['argocd-server-app', server, ...candidates.slice(0, MAX_LOOKUPS).map((c) => `${c.namespace ?? ''}/${c.name}`)],
    () => lookupOnServer(server, candidates),
    {
      // Each lookup spawns the argocd CLI; poll only once an app is found.
      refreshInterval: (latest) => (latest?.state === 'found' ? 60_000 : 0),
      revalidateOnFocus: false,
    },
  );

  if (isLoading || !data) return null;
  if (data.state === 'not-found') return <>{notFound}</>;

  const login = async () => {
    setPending('login');
    try {
      await apiClient.post('/api/auth/argocd/login', { server, authMode: 'sso' }, { timeoutMs: LONG_RUNNING_TIMEOUT_MS });
      toast.success('Logged in to Argo CD');
      await mutate();
    } catch (err: unknown) {
      toast.error(`Argo CD login failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setPending(null);
    }
  };

  if (data.state !== 'found') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <GitBranch className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {data.state === 'needs-login'
            ? <>Log in to Argo CD (<span className="font-mono">{server}</span>) to see and refresh this workload&apos;s app.</>
            : <>Could not reach Argo CD (<span className="font-mono">{server}</span>): {data.message}</>}
        </span>
        {data.state === 'needs-login' ? (
          <Button variant="outline" size="sm" onClick={login} disabled={pending !== null}>
            {pending === 'login' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Log in
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => { void mutate(); }}>Retry</Button>
        )}
        {trailing}
      </div>
    );
  }

  const app = data.app;
  const refresh = async (type: 'normal' | 'hard') => {
    if (pending) return;
    setPending(type);
    try {
      const res = await apiClient.post<{ app: ArgoCDServerAppSummary }>(
        `/api/argocd/apps/${encodeURIComponent(app.name)}`,
        { server, namespace: app.namespace, refresh: type },
        { timeoutMs: LONG_RUNNING_TIMEOUT_MS },
      );
      await mutate({ state: 'found', app: res.app }, { revalidate: false });
      toast.success(`${app.name}: ${type === 'hard' ? 'Hard refresh' : 'Refresh'} done`);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) await mutate();
      toast.error(`Argo CD refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setPending(null);
    }
  };

  const destination = app.destinationName || app.destinationServer;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Argo CD</span>
      <a
        href={getArgoCDServerAppUrl(server, app)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        title="Open in the Argo CD web UI"
      >
        {app.name}
        <ExternalLink className="h-3 w-3" />
      </a>
      <Badge variant="outline" className="text-xs font-mono font-normal" title="Argo CD server">
        {server}
      </Badge>
      {app.syncStatus && <StatusBadge status={app.syncStatus} />}
      {app.healthStatus && <StatusBadge status={app.healthStatus} />}
      {destination && (
        <span className="text-xs text-muted-foreground" title="Application destination">
          → <span className="font-mono">{destination}{app.destinationNamespace ? `/${app.destinationNamespace}` : ''}</span>
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => refresh('normal')} disabled={pending !== null}>
          {pending === 'normal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={() => refresh('hard')} disabled={pending !== null}>
          {pending === 'hard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
          Hard Refresh
        </Button>
        {trailing}
      </div>
    </div>
  );
}
