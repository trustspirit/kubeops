import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess, execSync } from 'child_process';

export const dynamic = 'force-dynamic';

interface PortForward {
  id: string;
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  containerPort: number;
  localPort: number;
  status: 'starting' | 'active' | 'error';
  error?: string;
  pid?: number;
}

// Server-side state for active port forwards
export const activeForwards = new Map<string, { info: PortForward; proc: ChildProcess }>();

/** Kill all active port forward processes. Called on server shutdown. */
export function cleanupAllForwards() {
  for (const [, { proc }] of activeForwards) {
    try { proc.kill(); } catch { /* ignore */ }
  }
  activeForwards.clear();
}

// Resolve kubectl path
let kubectlPath = '/usr/local/bin/kubectl';
try {
  const paths = execSync('which -a kubectl', { encoding: 'utf-8' }).trim().split('\n');
  kubectlPath = paths.find(p => !p.includes(' ') && !p.includes('.rd/bin'))
    || paths.find(p => !p.includes(' '))
    || paths[0]
    || kubectlPath;
} catch { /* use default */ }

function findFreePort(preferred: number): number {
  // Try preferred port first, then increment
  // In production, we'd check if port is free, but for simplicity use preferred
  const usedPorts = new Set(Array.from(activeForwards.values()).map(f => f.info.localPort));
  let port = preferred;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
}

// GET - list active port forwards
export async function GET() {
  const forwards = Array.from(activeForwards.values()).map(f => f.info);
  return NextResponse.json({ forwards });
}

// POST - start a port forward
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clusterId, namespace, resourceType, resourceName, containerPort, localPort: requestedPort } = body;

  if (!clusterId || !namespace || !resourceName || !containerPort) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const localPort = findFreePort(requestedPort || containerPort);
  const id = `${resourceType || 'pod'}/${resourceName}:${containerPort}`;

  // Kill existing forward for same target
  if (activeForwards.has(id)) {
    const existing = activeForwards.get(id)!;
    try { existing.proc.kill(); } catch { /* ignore */ }
    activeForwards.delete(id);
  }

  const target = resourceType === 'svc' || resourceType === 'services'
    ? `svc/${resourceName}`
    : `pod/${resourceName}`;

  const info: PortForward = {
    id,
    clusterId,
    namespace,
    resourceType: resourceType || 'pod',
    resourceName,
    containerPort,
    localPort,
    status: 'starting',
  };

  const proc = spawn(kubectlPath, [
    'port-forward',
    '--context', clusterId,
    '-n', namespace,
    target,
    `${localPort}:${containerPort}`,
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });

  info.pid = proc.pid;
  activeForwards.set(id, { info, proc });

  proc.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString();
    console.log(`[PortForward] ${id}: ${msg.trim()}`);
    if (msg.includes('Forwarding')) {
      info.status = 'active';
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    console.error(`[PortForward] ${id} error: ${msg}`);
    if (!msg.includes('handling connection')) {
      info.status = 'error';
      info.error = msg;
    }
  });

  proc.on('exit', (code) => {
    console.log(`[PortForward] ${id} exited with code ${code}`);
    activeForwards.delete(id);
  });

  // Wait briefly for it to start
  await new Promise(r => setTimeout(r, 500));

  return NextResponse.json({ forward: info });
}

// DELETE - stop a port forward
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const entry = activeForwards.get(id);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try { entry.proc.kill(); } catch { /* ignore */ }
  activeForwards.delete(id);

  return NextResponse.json({ success: true });
}
