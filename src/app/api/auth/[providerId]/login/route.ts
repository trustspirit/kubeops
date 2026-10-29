import { NextRequest, NextResponse } from 'next/server';
import '@/lib/auth/providers';
import { getProvider } from '@/lib/auth/registry';
import { validateConfig } from '@/lib/auth/validate-config';
import { runLoginOnce } from '@/lib/auth/login-dedupe';
import { invalidateKubeconfigDerivedCaches } from '@/lib/k8s/invalidate-config';
import { invalidateTshSessionCache, clearTeleportContextCache } from '@/lib/k8s/tsh-session-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  const { providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 404 });
  }

  let config: Record<string, string>;
  try {
    const body = await request.json();
    config = validateConfig(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // A double-click or a second window must not open a second SSO flow.
  const result = await runLoginOnce(providerId, config, () => provider.login(config));

  if (result.success) {
    // aws/gcloud/az (and tsh) rewrite ~/.kube/config during login. Drop every
    // kubeconfig-derived cache — API clients, cluster statuses (prevents a
    // stale 'disconnected' after login) — and point running watches at the
    // fresh credentials.
    invalidateKubeconfigDerivedCaches();
    // After successful auth, clear cached session state so that the next
    // health-check cycle re-evaluates Teleport contexts immediately.
    if (providerId === 'tsh') {
      invalidateTshSessionCache();
      clearTeleportContextCache();
    }

    // Enrich the response with the freshly-authenticated session info so the
    // client can persist it (user, expiry) without a second round-trip. Best-
    // effort: if getStatus throws (slow CLI), still return success.
    try {
      const status = await provider.getStatus(config);
      return NextResponse.json(
        {
          ...result,
          authenticated: status.authenticated,
          user: status.user,
          expiresAt: status.expiresAt ? status.expiresAt.toISOString() : undefined,
        },
        { status: 200 }
      );
    } catch {
      return NextResponse.json({ ...result, authenticated: true }, { status: 200 });
    }
  }

  return NextResponse.json(result, { status: 400 });
}
