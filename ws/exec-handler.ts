import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { parse } from 'url';
import * as pty from 'node-pty';
import { buildKubectlExecArgs, validateExecTarget } from '../src/lib/exec-validation';
import { resolveCli } from '../src/lib/cli-path';
import { sanitizeServerError } from '../src/lib/server-error';

const KEEPALIVE_INTERVAL_MS = 30_000;
// Pause the PTY once this much output is still queued on the socket, so
// `cat bigfile` or a runaway `yes` cannot grow the send buffer without bound
// while the renderer is busy painting. Same approach as the logs handler.
const MAX_SOCKET_BACKLOG_BYTES = 1024 * 1024;
const DRAIN_POLL_MS = 50;

const kubectlPath = resolveCli('kubectl');
console.log(`[Exec] Using kubectl: ${kubectlPath}`);

export function handleExecConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname, query } = parse(req.url ?? '', true);
  const parts = pathname?.split('/').filter(Boolean) ?? [];
  let targetInput: {
    clusterId?: unknown;
    namespace?: unknown;
    podName?: unknown;
    container?: unknown;
  };

  try {
    targetInput = {
      clusterId: parts[2] === undefined ? undefined : decodeURIComponent(parts[2]),
      namespace: parts[3] === undefined ? undefined : decodeURIComponent(parts[3]),
      podName: parts[4] === undefined ? undefined : decodeURIComponent(parts[4]),
      container: query.container,
    };
  } catch {
    targetInput = {};
  }

  const validation = validateExecTarget(targetInput);
  if (!validation.ok) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid exec target' }));
      ws.close();
    }
    return;
  }

  const target = validation.value;
  const { namespace, podName, container } = target;

  console.log(`[Exec] Starting: ${namespace}/${podName} (${container})`);

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(kubectlPath, buildKubectlExecArgs(target), {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : err;
    console.error(`[Exec] Failed to spawn PTY:`, errMsg);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: `Failed to start: ${sanitizeServerError(err, 'Unable to start exec session')}` }));
      ws.close();
    }
    return;
  }

  console.log(`[Exec] PTY spawned pid=${ptyProcess.pid} for ${namespace}/${podName}`);
  ws.send(JSON.stringify({ type: 'connected' }));

  let cleanedUp = false;
  let paused = false;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  let dataSubscription: pty.IDisposable | null = null;
  let exitSubscription: pty.IDisposable | null = null;

  // Without a ping, a socket that dies without a close frame (sleep, network
  // drop) leaves `kubectl exec` running against the cluster indefinitely.
  const keepalive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, KEEPALIVE_INTERVAL_MS);

  const cleanup = (killProcess: boolean) => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(keepalive);
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = null;
    dataSubscription?.dispose();
    exitSubscription?.dispose();
    ws.off('message', handleMessage);
    ws.off('close', handleClose);
    ws.off('error', handleError);
    if (killProcess) {
      try { ptyProcess.kill(); } catch { /* already dead */ }
    }
  };

  const resumeWhenDrained = () => {
    drainTimer = null;
    if (!paused || cleanedUp) return;
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount > MAX_SOCKET_BACKLOG_BYTES) {
      drainTimer = setTimeout(resumeWhenDrained, DRAIN_POLL_MS);
      return;
    }
    paused = false;
    try { ptyProcess.resume(); } catch { /* already dead */ }
  };

  // PTY output → browser
  dataSubscription = ptyProcess.onData((data: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(data);
    if (!paused && ws.bufferedAmount > MAX_SOCKET_BACKLOG_BYTES) {
      paused = true;
      try { ptyProcess.pause(); } catch { /* already dead */ }
      drainTimer = setTimeout(resumeWhenDrained, DRAIN_POLL_MS);
    }
  });

  exitSubscription = ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[Exec] PTY exited pid=${ptyProcess.pid} code=${exitCode} signal=${signal}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'exit',
        reason: exitCode === 0 ? 'Session ended' : `Exit code ${exitCode}`,
      }));
      ws.close();
    }
    cleanup(false);
  });

  // Browser input → PTY
  function handleMessage(rawData: Buffer | ArrayBuffer | Buffer[]) {
    let data: Buffer;
    if (Buffer.isBuffer(rawData)) {
      data = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      data = Buffer.from(rawData);
    } else if (Array.isArray(rawData)) {
      data = Buffer.concat(rawData);
    } else {
      return;
    }

    if (data.length === 0) return;

    const type = data[0];
    const payload = data.subarray(1);

    if (type === 0) {
      // stdin
      ptyProcess.write(payload.toString('utf-8'));
    } else if (type === 1) {
      // resize
      try {
        const { cols, rows } = JSON.parse(payload.toString());
        if (
          Number.isInteger(cols)
          && Number.isFinite(cols)
          && cols >= 1
          && cols <= 500
          && Number.isInteger(rows)
          && Number.isFinite(rows)
          && rows >= 1
          && rows <= 500
        ) {
          ptyProcess.resize(cols, rows);
        }
      } catch { /* ignore */ }
    }
  }

  function handleClose() {
    console.log(`[Exec] Client disconnected, killing PTY pid=${ptyProcess.pid}`);
    cleanup(true);
  }

  function handleError() {
    cleanup(true);
  }

  ws.on('message', handleMessage);
  ws.on('close', handleClose);
  ws.on('error', handleError);
}
