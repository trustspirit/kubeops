import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isHelmAvailable, isValidHelmName } from '@/lib/helm/helm-runner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH.' },
      { status: 503 }
    );
  }

  const { clusterId } = await params;
  const contextName = decodeURIComponent(clusterId);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { releaseName, chart, namespace, values, createNamespace } = body;

  if (!releaseName || !isValidHelmName(releaseName)) {
    return NextResponse.json({ error: 'Valid releaseName is required (alphanumeric, hyphens, dots, underscores)' }, { status: 400 });
  }
  if (!chart) {
    return NextResponse.json({ error: 'chart is required' }, { status: 400 });
  }
  if (!namespace) {
    return NextResponse.json({ error: 'namespace is required' }, { status: 400 });
  }

  let tmpFile: string | null = null;

  try {
    const args = ['install', releaseName, chart, '-n', namespace, '--output', 'json'];

    if (createNamespace !== false) {
      args.push('--create-namespace');
    }

    if (values && typeof values === 'string' && values.trim()) {
      tmpFile = path.join(os.tmpdir(), `kubeops-helm-install-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
      fs.writeFileSync(tmpFile, values, { encoding: 'utf-8', mode: 0o600 });
      args.push('-f', tmpFile);
    }

    const result = await runHelm(args, contextName);

    if (result.code !== 0) {
      console.error(`[Helm] install ${releaseName} failed: ${result.stderr}`);
      return NextResponse.json(
        { error: result.stderr || `Failed to install chart "${chart}" as "${releaseName}"` },
        { status: 500 }
      );
    }

    try {
      const installed = JSON.parse(result.stdout);
      return NextResponse.json(installed);
    } catch {
      return NextResponse.json({ success: true, message: result.stdout.trim() });
    }
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }
}
