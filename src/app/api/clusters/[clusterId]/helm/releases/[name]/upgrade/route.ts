import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isHelmAvailable } from '@/lib/helm/helm-runner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; name: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH.' },
      { status: 503 }
    );
  }

  const { clusterId, name } = await params;
  const contextName = decodeURIComponent(clusterId);
  const releaseName = decodeURIComponent(name);

  let body: any;
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

  let tmpFile: string | null = null;

  try {
    const args = ['upgrade', releaseName, chart, '-n', namespace, '--output', 'json'];

    if (reuseValues) {
      args.push('--reuse-values');
    }

    if (values && typeof values === 'string' && values.trim()) {
      tmpFile = path.join(os.tmpdir(), `kubeops-helm-upgrade-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
      fs.writeFileSync(tmpFile, values, { encoding: 'utf-8', mode: 0o600 });
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
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }
}
