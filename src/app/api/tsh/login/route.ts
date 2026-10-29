import { NextRequest, NextResponse } from 'next/server';
import '@/lib/auth/providers';
import { getProvider } from '@/lib/auth/registry';
import { validateConfig } from '@/lib/auth/validate-config';
import { runLoginOnce } from '@/lib/auth/login-dedupe';
import { invalidateKubeconfigDerivedCaches } from '@/lib/k8s/invalidate-config';
import { invalidateTshSessionCache, clearTeleportContextCache } from '@/lib/k8s/tsh-session-guard';

export const dynamic = 'force-dynamic';

// Legacy endpoint: the UI logs in through /api/auth/[providerId]/login. Kept
// for external callers, but it must invalidate the same caches — otherwise a
// login here left Teleport clusters reported as 'disconnected' for up to 60s.
export async function POST(request: NextRequest) {
  const provider = getProvider('tsh');
  if (!provider) {
    return NextResponse.json({ error: 'tsh provider not registered' }, { status: 500 });
  }

  let config: Record<string, string>;
  try {
    const body = await request.json();
    config = validateConfig(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Same single-flight key as the main login route, so the two endpoints
  // cannot race each other into two browser flows either.
  const result = await runLoginOnce('tsh', config, () => provider.login(config));

  if (result.success) {
    invalidateKubeconfigDerivedCaches();
    invalidateTshSessionCache();
    clearTeleportContextCache();
    return NextResponse.json({ success: true, output: result.output });
  }
  return NextResponse.json({ error: result.error }, { status: 500 });
}
