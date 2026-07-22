import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess, execSync } from 'child_process';
import {
  createPortForwardId,
  findAvailableLoopbackPort,
  validatePortForwardRequest,
} from '@/lib/port-forward';
import { waitForPortForwardReady } from '@/lib/port-forward-process';
import { sanitizeServerError } from '@/lib/server-error';

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
const pendingForwardIds = new Set<string>();
const pendingLocalPorts = new Set<number>();
let portSelectionQueue = Promise.resolve();

function deleteForwardIfSame(id: string, proc: ChildProcess): boolean {
  if (activeForwards.get(id)?.proc !== proc) return false;
  return activeForwards.delete(id);
}

async function reserveAvailableLocalPort(preferred: number): Promise<number> {
  let releaseSelection!: () => void;
  const previousSelection = portSelectionQueue;
  portSelectionQueue = new Promise<void>(resolve => { releaseSelection = resolve; });
  await previousSelection;

  try {
    const reserved = new Set([
      ...Array.from(activeForwards.values(), entry => entry.info.localPort),
      ...pendingLocalPorts,
    ]);
    const localPort = await findAvailableLoopbackPort(preferred, reserved);
    pendingLocalPorts.add(localPort);
    return localPort;
  } finally {
    releaseSelection();
  }
}

/** Kill all active port forward processes. Called on server shutdown. */
export function cleanupAllForwards() {
  for (const [, { proc }] of activeForwards) {
    try { proc.kill(); } catch { /* ignore */ }
  }
  activeForwards.clear();
  pendingForwardIds.clear();
  pendingLocalPorts.clear();
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

// GET - list active port forwards
export async function GET() {
  const forwards = Array.from(activeForwards.values()).map(f => f.info);
  return NextResponse.json({ forwards });
}

// POST - start a port forward
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validatePortForwardRequest(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const request = validation.value;
  const id = createPortForwardId(request);
  if (activeForwards.has(id) || pendingForwardIds.has(id)) {
    return NextResponse.json({ error: 'Port forward already exists' }, { status: 409 });
  }

  pendingForwardIds.add(id);
  let localPort: number | undefined;
  let proc: ChildProcess | undefined;

  try {
    localPort = await reserveAvailableLocalPort(request.localPort);
    const target = `${request.resourceType}/${request.resourceName}`;
    const info: PortForward = {
      id,
      clusterId: request.clusterId,
      namespace: request.namespace,
      resourceType: request.resourceType,
      resourceName: request.resourceName,
      containerPort: request.containerPort,
      localPort,
      status: 'starting',
    };

    proc = spawn(kubectlPath, [
      'port-forward',
      '--context', request.clusterId,
      '-n', request.namespace,
      target,
      `${localPort}:${request.containerPort}`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    info.pid = proc.pid;
    const startedProcess = proc;
    activeForwards.set(id, { info, proc: startedProcess });
    pendingLocalPorts.delete(localPort);

    proc.once('exit', code => {
      if (deleteForwardIfSame(id, startedProcess)) {
        console.log(`[PortForward] ${id} exited with code ${code}`);
      }
    });

    await waitForPortForwardReady(startedProcess, 10_000);
    if (activeForwards.get(id)?.proc !== startedProcess) {
      throw new Error('Port forward was stopped during startup');
    }
    info.status = 'active';
    proc.stdout?.resume();
    proc.stderr?.resume();
    return NextResponse.json({ forward: info });
  } catch (error) {
    if (proc) {
      try { proc.kill(); } catch { /* process already stopped */ }
      deleteForwardIfSame(id, proc);
    }
    const rawMessage = error instanceof Error ? error.message : '';
    console.error('[PortForward] failed to start:', error);
    const message = sanitizeServerError(error, 'Unable to start port forward');
    const status = rawMessage === 'No available local port found' ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  } finally {
    pendingForwardIds.delete(id);
    if (localPort !== undefined) pendingLocalPorts.delete(localPort);
  }
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
  deleteForwardIfSame(id, entry.proc);

  return NextResponse.json({ success: true });
}
