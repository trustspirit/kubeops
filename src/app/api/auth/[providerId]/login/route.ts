import { NextRequest, NextResponse } from 'next/server';
import '@/lib/auth/providers';
import { getProvider } from '@/lib/auth/registry';
import { clearClientCache } from '@/lib/k8s/client-factory';
import { validateConfig } from '@/lib/auth/validate-config';
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

  const result = await provider.login(config);

  if (result.success) {
    clearClientCache();
    // After successful auth, clear cached session state so that the next
    // health-check cycle re-evaluates Teleport contexts immediately.
    if (providerId === 'tsh') {
      invalidateTshSessionCache();
      clearTeleportContextCache();
    }
  }

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
