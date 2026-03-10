import { NextRequest, NextResponse } from 'next/server';
import '@/lib/auth/providers';
import { getProvider } from '@/lib/auth/registry';

export const dynamic = 'force-dynamic';

// Allowed config keys per provider for status checks
const ALLOWED_STATUS_KEYS: Record<string, string[]> = {
  'tsh': [],
  'aws-sso': ['profile'],
  'aws-iam': ['profile'],
  'oidc': ['issuerUrl', 'clientId'],
  'gke': [],
  'aks': [],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  const { providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 404 });
  }

  const allowed = ALLOWED_STATUS_KEYS[providerId] || [];
  const config: Record<string, string> = {};
  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => {
    if (allowed.includes(key) && typeof value === 'string' && value.length <= 256) {
      config[key] = value;
    }
  });

  const status = await provider.getStatus(config);
  return NextResponse.json(status);
}
