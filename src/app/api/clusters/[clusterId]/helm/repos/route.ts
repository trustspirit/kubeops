import { NextRequest, NextResponse } from 'next/server';
import { runHelm, isHelmAvailable, isValidHelmName, isValidRepoUrl } from '@/lib/helm/helm-runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH.' },
      { status: 503 }
    );
  }

  const result = await runHelm(['repo', 'list', '--output', 'json']);

  if (result.code !== 0) {
    // helm repo list returns error when no repos are configured
    if (result.stderr.includes('no repositories')) {
      return NextResponse.json({ repos: [] });
    }
    console.error(`[Helm] repo list failed: ${result.stderr}`);
    return NextResponse.json(
      { error: result.stderr || 'Failed to list Helm repos' },
      { status: 500 }
    );
  }

  try {
    const repos = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse Helm output' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isHelmAvailable()) {
    return NextResponse.json(
      { error: 'Helm CLI is not installed or not found in PATH.' },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, url } = body;

  if (!name || !url) {
    return NextResponse.json({ error: 'name and url are required' }, { status: 400 });
  }
  if (!isValidHelmName(name)) {
    return NextResponse.json({ error: 'Invalid repo name format. Use alphanumeric, hyphens, dots, or underscores.' }, { status: 400 });
  }
  if (!isValidRepoUrl(url)) {
    return NextResponse.json({ error: 'Invalid repo URL. Must be a valid http/https/oci URL.' }, { status: 400 });
  }

  // Add repo
  const addResult = await runHelm(['repo', 'add', name, url]);
  if (addResult.code !== 0) {
    console.error(`[Helm] repo add ${name} failed: ${addResult.stderr}`);
    return NextResponse.json(
      { error: addResult.stderr || `Failed to add repo "${name}"` },
      { status: 500 }
    );
  }

  // Update repos
  const updateResult = await runHelm(['repo', 'update']);
  if (updateResult.code !== 0) {
    console.warn(`[Helm] repo update after add failed: ${updateResult.stderr}`);
    // Don't fail - repo was added successfully
  }

  return NextResponse.json({ success: true, message: `Repository "${name}" added successfully` });
}
