import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

function findTsh(): string {
  try {
    return execSync('which tsh', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error('tsh not found in PATH. Please install Teleport CLI.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const tshPath = findTsh();

    if (action === 'proxy-login') {
      const { proxyUrl, authType } = body;
      if (!proxyUrl) {
        return NextResponse.json({ error: 'proxyUrl is required' }, { status: 400 });
      }
      const args = [`login`, `--proxy=${proxyUrl}`];
      if (authType) {
        args.push(`--auth=${authType}`);
      }
      const cmd = `${tshPath} ${args.join(' ')}`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 120_000 });
      return NextResponse.json({ success: true, output });
    }

    if (action === 'kube-login') {
      const { cluster } = body;
      if (!cluster) {
        return NextResponse.json({ error: 'cluster is required' }, { status: 400 });
      }
      const cmd = `${tshPath} kube login ${cluster}`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 });
      return NextResponse.json({ success: true, output });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; message?: string };
    const message = e.stderr?.toString() || e.message || 'tsh command failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
