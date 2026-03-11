import { NextRequest, NextResponse } from 'next/server';
import { detectProvider } from '@/lib/auth/provider-detector';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);
  const result = detectProvider(contextName);
  return NextResponse.json(result);
}
