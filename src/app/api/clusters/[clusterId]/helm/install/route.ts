/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isValidHelmName } from '@/lib/helm/helm-runner';
import { requireHelm, withTempValuesFile } from '@/lib/helm/helpers';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const helmCheck = requireHelm();
  if (helmCheck) return helmCheck;

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

  return withTempValuesFile(values, async (tmpFile) => {
    const args = ['install', releaseName, chart, '-n', namespace, '--output', 'json'];

    if (createNamespace !== false) {
      args.push('--create-namespace');
    }

    if (tmpFile) {
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
  });
}
