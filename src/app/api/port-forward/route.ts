import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import {
  createPortForwardId,
  findAvailableLoopbackPort,
  validatePortForwardRequest,
} from '@/lib/port-forward';
import { monitorPortForward, waitForPortForwardReady, waitForProcessExit } from '@/lib/port-forward-process';
import { getForwards, killAllForwards, type PortForwardInfo } from '@/lib/port-forward-registry';
import { resolveCli } from '@/lib/cli-path';
import { sanitizeServerError } from '@/lib/server-error';

export const dynamic = 'force-dynamic';

type PortForward = PortForwardInfo;

// Shared across the bundled server and the Next-loaded route module.
const activeForwards = getForwards();
const pendingForwardIds = new Set<string>();
const pendingLocalPorts = new Set<number>();
let portSelectionQueue = Promise.resolve();

// A forward whose kubectl died stays listed as status 'error' (with the
// reason) so the UI can say *why* it stopped, then ages out.
const FAILED_FORWARD_TTL_MS = 5 * 60_000;
const failedAt = new Map<string, number>();
// How long DELETE waits for kubectl to release the local port.
const STOP_WAIT_MS = 3_000;

function pruneFailedForwards(): void {
  const now = Date.now();
  for (const [id, at] of failedAt) {
    if (now - at < FAILED_FORWARD_TTL_MS) continue;
    failedAt.delete(id);
    if (activeForwards.get(id)?.info.status === 'error') activeForwards.delete(id);
  }
}

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
      // A failed forward's kubectl has exited, so its port is free again.
      ...Array.from(activeForwards.values())
        .filter(entry => entry.info.status !== 'error')
        .map(entry => entry.info.localPort),
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
  killAllForwards();
  pendingForwardIds.clear();
  pendingLocalPorts.clear();
}

const kubectlPath = resolveCli('kubectl');

// Detach the failure monitor before an intentional stop so it is not
// reported as an error. Weak: entries die with their process.
const stopMonitors = new WeakMap<ChildProcess, () => void>();

// GET - list active port forwards
export async function GET() {
  pruneFailedForwards();
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
  // Restarting a failed forward replaces its 'error' entry.
  if (activeForwards.get(id)?.info.status === 'error') {
    activeForwards.delete(id);
    failedAt.delete(id);
  }
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

    // Startup-phase exit: the POST below reports the failure and drops the
    // entry. Once active, monitorPortForward takes over.
    const onStartupExit = (code: number | null) => {
      if (deleteForwardIfSame(id, startedProcess)) {
        console.log(`[PortForward] ${id} exited during startup with code ${code}`);
      }
    };
    proc.once('exit', onStartupExit);

    await waitForPortForwardReady(startedProcess, 10_000);
    if (activeForwards.get(id)?.proc !== startedProcess) {
      throw new Error('Port forward was stopped during startup');
    }
    proc.off('exit', onStartupExit);
    info.status = 'active';
    const stopMonitoring = monitorPortForward(startedProcess, reason => {
      if (activeForwards.get(id)?.proc !== startedProcess) return;
      console.log(`[PortForward] ${id} stopped: ${reason}`);
      info.status = 'error';
      info.error = reason;
      info.pid = undefined;
      failedAt.set(id, Date.now());
    });
    stopMonitors.set(startedProcess, stopMonitoring);
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

  stopMonitors.get(entry.proc)?.();
  try { entry.proc.kill(); } catch { /* ignore */ }
  deleteForwardIfSame(id, entry.proc);
  failedAt.delete(id);

  // Respond only once kubectl has released the local port, so an immediate
  // restart on the same port does not fail with "address already in use".
  const exited = await waitForProcessExit(entry.proc, STOP_WAIT_MS);
  if (!exited) {
    try { entry.proc.kill('SIGKILL'); } catch { /* ignore */ }
  }

  return NextResponse.json({ success: true });
}
