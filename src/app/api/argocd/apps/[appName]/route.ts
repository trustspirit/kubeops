import { NextRequest, NextResponse } from 'next/server';
import { findCli, runCli, extractCliError } from '@/lib/auth/cli-utils';
import type { ArgoCDApplication } from '@/lib/argocd/helpers';
import { buildAppGetArgs } from '@/lib/argocd/sync-latest';
import { classifyArgoCDCliError, summarizeServerApp, toArgoCDAppRef } from '@/lib/argocd/server-app';

export const dynamic = 'force-dynamic';

/**
 * Read or refresh an Application through the Argo CD server (argocd CLI, using
 * the login from Settings > Auth Providers) rather than through Kubernetes.
 * This is what reaches a root Argo CD whose own cluster is not in kubeconfig.
 *
 *   GET  ?server=&namespace=                    → app summary, no refresh
 *   POST { server, namespace?, refresh }        → `argocd app get --refresh|--hard-refresh`
 */

interface RouteParams {
  params: Promise<{ appName: string }>;
}

async function getApp(
  appName: string,
  opts: { server?: string; namespace?: string; refresh?: 'normal' | 'hard' },
): Promise<NextResponse> {
  const argocdPath = await findCli('argocd');
  if (!argocdPath) {
    return NextResponse.json(
      { error: 'argocd CLI not found. Install it and log in from Settings > Auth Providers.', code: 'no-cli' },
      { status: 503 },
    );
  }

  let args: string[];
  try {
    args = buildAppGetArgs(toArgoCDAppRef(appName, opts.namespace), {
      server: opts.server,
      refresh: opts.refresh === 'normal',
      hardRefresh: opts.refresh === 'hard',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid request' }, { status: 400 });
  }

  try {
    const out = await runCli(argocdPath, args, opts.refresh ? 60_000 : 20_000, { label: 'Reading the ArgoCD app' });
    return NextResponse.json({ app: summarizeServerApp(JSON.parse(out) as ArgoCDApplication) });
  } catch (err: unknown) {
    const message = extractCliError(err, `Failed to read ArgoCD app "${appName}"`);
    const kind = classifyArgoCDCliError(message);
    if (kind === 'auth') return NextResponse.json({ error: message, needsLogin: true }, { status: 401 });
    if (kind === 'not-found') return NextResponse.json({ error: message, notFound: true }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { appName } = await params;
  const server = req.nextUrl.searchParams.get('server')?.trim() || undefined;
  const namespace = req.nextUrl.searchParams.get('namespace')?.trim() || undefined;
  return getApp(decodeURIComponent(appName), { server, namespace });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { appName } = await params;
  let body: { server?: string; namespace?: string; refresh?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.refresh !== 'normal' && body.refresh !== 'hard') {
    return NextResponse.json({ error: 'refresh must be "normal" or "hard"' }, { status: 400 });
  }
  return getApp(decodeURIComponent(appName), {
    server: body.server?.trim() || undefined,
    namespace: body.namespace?.trim() || undefined,
    refresh: body.refresh,
  });
}
