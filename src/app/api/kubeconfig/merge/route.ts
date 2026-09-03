import { NextRequest, NextResponse } from 'next/server';
import { sanitizeServerError } from '@/lib/server-error';
import { mergeKubeconfig } from '@/lib/kubeconfig-editor';
import { invalidateKubeconfigDerivedCaches } from '@/lib/k8s/invalidate-config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { yaml, strategy } = body;

    if (!yaml) {
      return NextResponse.json({ error: 'yaml is required' }, { status: 400 });
    }

    const mergeStrategy = strategy === 'overwrite' ? 'overwrite' : 'skip';
    const result = await mergeKubeconfig(yaml, mergeStrategy);
    invalidateKubeconfigDerivedCaches();

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const message = sanitizeServerError(error, 'Failed to merge kubeconfig');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
