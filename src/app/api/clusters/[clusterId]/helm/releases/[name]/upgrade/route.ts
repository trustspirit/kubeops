import { NextRequest, NextResponse } from 'next/server';
import { runHelm } from '@/lib/helm/helm-runner';
import { requireHelm, withTempValuesFile } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);

  let body: { chart?: string; namespace?: string; values?: string; reuseValues?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chart, namespace, values, reuseValues } = body;

  if (!chart) {
    return NextResponse.json({ error: 'chart is required' }, { status: 400 });
  }
  if (!namespace) {
    return NextResponse.json({ error: 'namespace is required' }, { status: 400 });
  }

  return withTempValuesFile(values, async (tmpFile) => {
    const args = ['upgrade', releaseName, chart, '-n', namespace, '--output', 'json'];

    if (reuseValues) {
      args.push('--reuse-values');
    }

    if (tmpFile) {
      args.push('-f', tmpFile);
    }

    const result = await runHelm(args, contextName);

    if (result.code !== 0) {
      console.error(`[Helm] upgrade ${releaseName} failed: ${result.stderr}`);
      return NextResponse.json(
        { error: result.stderr || `Failed to upgrade release "${releaseName}"` },
        { status: 500 }
      );
    }

    try {
      const upgraded = JSON.parse(result.stdout);
      return NextResponse.json(upgraded);
    } catch {
      // upgrade succeeded but output may not be JSON
      return NextResponse.json({ success: true, message: result.stdout.trim() });
    }
  });
}
