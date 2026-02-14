import { NextRequest, NextResponse } from 'next/server';
import { getContexts, loadKubeConfig, getClusterServer } from '@/lib/k8s/kubeconfig-manager';
import { readKubeconfigRaw } from '@/lib/kubeconfig-editor';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const format = new URL(req.url).searchParams.get('format');

  try {
    if (format === 'raw') {
      const rawYaml = await readKubeconfigRaw();
      return NextResponse.json({ yaml: rawYaml });
    }

    const contexts = getContexts();
    const kc = loadKubeConfig();

    const contextList = contexts.map(ctx => ({
      name: ctx.name,
      cluster: ctx.cluster,
      user: ctx.user,
      namespace: ctx.namespace || 'default',
      server: getClusterServer(ctx.name),
      isCurrent: kc.getCurrentContext() === ctx.name,
    }));

    return NextResponse.json({ contexts: contextList });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load kubeconfig';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
