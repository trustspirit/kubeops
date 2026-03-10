import { NextResponse } from 'next/server';
import '@/lib/auth/providers';
import { getProvider } from '@/lib/auth/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = getProvider('tsh');
  if (!provider) {
    return NextResponse.json({ loggedIn: false, reason: 'tsh provider not registered' });
  }

  const status = await provider.getStatus({});
  return NextResponse.json({
    loggedIn: status.authenticated,
    username: status.user,
    validUntil: status.expiresAt?.toISOString(),
  });
}
