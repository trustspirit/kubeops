import { NextRequest, NextResponse } from 'next/server';
import { listContexts, addContext } from '@/lib/kubeconfig-editor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const contexts = await listContexts();
    return NextResponse.json({ contexts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list contexts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, cluster, user, namespace, server, certificateAuthorityData, token, clientCertificateData, clientKeyData } = body;

    if (!name || !cluster || !user) {
      return NextResponse.json(
        { error: 'name, cluster, and user are required' },
        { status: 400 }
      );
    }

    await addContext({
      name,
      cluster,
      user,
      namespace,
      server,
      certificateAuthorityData,
      token,
      clientCertificateData,
      clientKeyData,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
