import { NextRequest, NextResponse } from 'next/server';
import { updateContext, deleteContext, setCurrentContext } from '@/lib/kubeconfig-editor';

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
      return NextResponse.json({ success: true });
    }

    await updateContext(contextName, { cluster, user, namespace });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { name } = await params;
  const contextName = decodeURIComponent(name);

  try {
    await deleteContext(contextName);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
