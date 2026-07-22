import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const nonce = process.env.KUBEOPS_SESSION_NONCE;
  if (!nonce) return NextResponse.json({ error: 'Session unavailable' }, { status: 503 });
  return NextResponse.json({ nonce }, { headers: { 'Cache-Control': 'no-store' } });
}
