import { NextRequest, NextResponse } from 'next/server';
import { sanitizeServerError } from '@/lib/server-error';
import { updateContext, deleteContext, setCurrentContext } from '@/lib/kubeconfig-editor';
import { invalidateKubeconfigDerivedCaches } from '@/lib/k8s/invalidate-config';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ name: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { name } = await params;
  const contextName = decodeURIComponent(name);

  try {
    const body = await req.json();
    const { cluster, user, namespace, setAsCurrent } = body;

    if (setAsCurrent) {
      await setCurrentContext(contextName);
      invalidateKubeconfigDerivedCaches();
      return NextResponse.json({ success: true });
    }

    await updateContext(contextName, { cluster, user, namespace });
    invalidateKubeconfigDerivedCaches();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = sanitizeServerError(error, 'Failed to update context');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { name } = await params;
  const contextName = decodeURIComponent(name);

  try {
    await deleteContext(contextName);
    invalidateKubeconfigDerivedCaches();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = sanitizeServerError(error, 'Failed to delete context');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
