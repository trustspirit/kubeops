import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { parse } from 'url';
import { execSync } from 'child_process';
import * as pty from 'node-pty';

// macOS GUI apps don't inherit shell PATH — ensure common tool directories are included
const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
const currentPath = process.env.PATH || '';
const missingPaths = EXTRA_PATHS.filter(p => !currentPath.split(':').includes(p));
if (missingPaths.length) {
  process.env.PATH = [...currentPath.split(':'), ...missingPaths].filter(Boolean).join(':');
}

// Resolve kubectl path at startup
let kubectlPath = 'kubectl';
try {
  const paths = execSync('which -a kubectl', { encoding: 'utf-8' }).trim().split('\n');
  kubectlPath = paths.find(p => !p.includes(' ') && !p.includes('.rd/bin'))
    || paths.find(p => !p.includes(' '))
    || paths[0]
    || kubectlPath;
} catch { /* use default */ }
console.log(`[Exec] Using kubectl: ${kubectlPath}`);

/** Shell-escape a single argument */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

export function handleExecConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname, query } = parse(req.url!, true);
  const parts = pathname!.split('/').filter(Boolean);
  const clusterId = decodeURIComponent(parts[2]);
  const namespace = parts[3];
  const podName = parts[4];
  const container = query.container as string;

  console.log(`[Exec] Starting: ${namespace}/${podName} (${container})`);

  let ptyProcess: pty.IPty;
  try {
    // Spawn via /bin/sh to avoid posix_spawnp issues in Electron
    const cmd = [
      shellEscape(kubectlPath),
      'exec', '-i', '-t',
      '--context', shellEscape(clusterId),
      '-n', shellEscape(namespace),
      '-c', shellEscape(container),
      shellEscape(podName),
      '--', 'sh', '-c', "'clear; (bash || ash || sh)'",
    ].join(' ');

    ptyProcess = pty.spawn('/bin/sh', ['-c', cmd], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
  } catch (err: any) {
    console.error(`[Exec] Failed to spawn PTY:`, err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: `Failed to start: ${err.message}` }));
      ws.close();
    }
    return;
  }

  console.log(`[Exec] PTY spawned pid=${ptyProcess.pid} for ${namespace}/${podName}`);
  ws.send(JSON.stringify({ type: 'connected' }));

  // PTY output → browser
  ptyProcess.onData((data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[Exec] PTY exited pid=${ptyProcess.pid} code=${exitCode} signal=${signal}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'exit',
        reason: exitCode === 0 ? 'Session ended' : `Exit code ${exitCode}`,
      }));
      ws.close();
    }
  });

  // Browser input → PTY
  ws.on('message', (rawData: Buffer | ArrayBuffer | Buffer[]) => {
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
        ptyProcess.resize(cols, rows);
      } catch { /* ignore */ }
    }
  });

  ws.on('close', () => {
    console.log(`[Exec] Client disconnected, killing PTY pid=${ptyProcess.pid}`);
    try { ptyProcess.kill(); } catch { /* already dead */ }
  });

  ws.on('error', () => {
    try { ptyProcess.kill(); } catch { /* already dead */ }
  });
}
