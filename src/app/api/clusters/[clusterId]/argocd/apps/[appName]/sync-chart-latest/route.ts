import { NextRequest, NextResponse } from 'next/server';
import { findCli, runCli, extractCliError } from '@/lib/auth/cli-utils';
import type { ArgoCDApplication } from '@/lib/argocd/helpers';
import {
  buildAppGetArgs,
  buildAppSyncArgs,
  getChartSource,
  getSyncedRevision,
  getSyncStatus,
  isTargetRevisionPinned,
} from '@/lib/argocd/sync-latest';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; appName: string }>;
}

interface Body {
  namespace?: string;
  server?: string;
  checkOnly?: boolean;
  sync?: boolean;
}

export interface ChartSyncPlan {
  pinned: boolean;
  chart: string;
  currentRevision: string;
  syncedRevision?: string;
  syncStatus?: string;
  updateAvailable: boolean;
  latest?: string;
  supported: boolean;
  reason?: string;
}

function isArgocdAuthError(message: string): boolean {
  return /not logged in|please login|Unauthenticated|invalid session|token is expired|expired token/i.test(message);
}

// Pure decision logic — no CLI/IO — so it is unit-testable.
export function planChartSync(
  app: Pick<ArgoCDApplication, 'spec' | 'status'>,
  _opts: { checkOnly?: boolean },
): ChartSyncPlan {
  const source = getChartSource(app);
  if (!source) {
    return {
      pinned: false, chart: '', currentRevision: '', updateAvailable: false,
      supported: false, reason: 'Application is not a single Helm chart source',
    };
  }
  const pinned = isTargetRevisionPinned(source.targetRevision);
  const syncedRevision = getSyncedRevision(app);
  const syncStatus = getSyncStatus(app);
  if (pinned) {
    return {
      pinned: true, chart: source.chart, currentRevision: source.targetRevision,
      syncedRevision, syncStatus, updateAvailable: false, supported: false,
      reason: 'Pinned targetRevision — enumerating newer chart versions is not yet supported',
    };
  }
  return {
    pinned: false, chart: source.chart, currentRevision: source.targetRevision,
    syncedRevision, syncStatus,
    updateAvailable: syncStatus === 'OutOfSync',
    supported: true,
  };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const argocdPath = findCli('argocd');
  if (!argocdPath) {
    return NextResponse.json(
      { error: 'argocd CLI not found. Install it and run login from Settings > Auth Providers.' },
      { status: 503 },
    );
  }

  const { appName } = await params;
  const app = decodeURIComponent(appName);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const server = body.server?.trim() || undefined;

  let appJson: Pick<ArgoCDApplication, 'spec' | 'status'>;
  try {
    const out = runCli(argocdPath, buildAppGetArgs(app, { server, refresh: true }), 60_000);
    appJson = JSON.parse(out);
  } catch (err: unknown) {
    const message = extractCliError(err, `Failed to read ArgoCD app "${app}"`);
    const needsLogin = isArgocdAuthError(message);
    return NextResponse.json({ error: message, needsLogin }, { status: needsLogin ? 401 : 500 });
  }

  const plan = planChartSync(appJson, { checkOnly: body.checkOnly });

  if (!plan.supported) {
    return NextResponse.json({ ...plan }, { status: 400 });
  }
  if (body.checkOnly) {
    return NextResponse.json({ ...plan });
  }
  if (!plan.updateAvailable) {
    return NextResponse.json({ ...plan, skipped: true });
  }
  if (body.sync !== true) {
    return NextResponse.json({ ...plan });
  }

  try {
    const out = runCli(argocdPath, buildAppSyncArgs(app, { server }), 300_000);
    return NextResponse.json({ ...plan, synced: true, output: out.trim() });
  } catch (err: unknown) {
    const message = extractCliError(err, `Failed to sync ArgoCD app "${app}"`);
    const needsLogin = isArgocdAuthError(message);
    return NextResponse.json({ error: message, needsLogin }, { status: needsLogin ? 401 : 500 });
  }
}
