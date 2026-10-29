import { NextRequest, NextResponse } from 'next/server';
import { sanitizeServerError } from '@/lib/server-error';
import { mergeKubeconfig, parseExternalKubeconfig, previewMerge } from '@/lib/kubeconfig-editor';
import { invalidateKubeconfigDerivedCaches } from '@/lib/k8s/invalidate-config';

export const dynamic = 'force-dynamic';

/**
 * POST { yaml, strategy?: 'skip' | 'overwrite', dryRun?: boolean }
 *
 * - dryRun: true  → { preview: { result, conflicts, incoming } } — nothing is written.
 * - otherwise     → { success: true, result } where result also lists `renamed`
 *   clusters/users (name taken by different content, added as `<name>-N`).
 */
export async function POST(req: NextRequest) {
  let body: { yaml?: unknown; strategy?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { yaml, strategy, dryRun } = body;
  if (!yaml || typeof yaml !== 'string') {
    return NextResponse.json({ error: 'yaml is required' }, { status: 400 });
  }

  try {
    parseExternalKubeconfig(yaml);
  } catch (error: unknown) {
    return NextResponse.json({ error: sanitizeServerError(error, 'Invalid kubeconfig YAML') }, { status: 400 });
  }

  const mergeStrategy = strategy === 'overwrite' ? 'overwrite' : 'skip';

  try {
    if (dryRun === true) {
      const preview = await previewMerge(yaml, mergeStrategy);
      return NextResponse.json({ preview });
    }

    const result = await mergeKubeconfig(yaml, mergeStrategy);
    invalidateKubeconfigDerivedCaches();

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const message = sanitizeServerError(error, 'Failed to merge kubeconfig');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
