// Suppress punycode deprecation warning from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) return;
  console.warn(warning.name, warning.message);
});

import { randomBytes, timingSafeEqual } from 'crypto';
import { createServer, type IncomingMessage } from 'http';
import { parse } from 'url';
import type { Duplex } from 'stream';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { handleLogsConnection } from './ws/logs-handler';
import { handleExecConnection } from './ws/exec-handler';
import { handleWatchConnection } from './ws/watch-handler';
import { shutdownAllWatchManagers } from './src/lib/k8s/watch-manager';
import { killAllForwards } from './src/lib/port-forward-registry';
import { isAllowedLocalHost, isAllowedWebSocketUpgrade } from './src/lib/local-server-security';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '51230', 10);
const sessionNonce = randomBytes(32).toString('base64url');
process.env.KUBEOPS_SESSION_NONCE = sessionNonce;

// Exit code the Electron shell recognises as "port already taken".
const EXIT_ADDRESS_IN_USE = 98;

// Set by electron/main.js when it spawns us. The launch token lets the shell
// tell *this* server apart from an orphan left behind by a previous run (which
// would answer /api/session just as happily). Removed from the environment so
// kubectl/tsh/helm children do not inherit it.
const launchToken = process.env.KUBEOPS_LAUNCH_TOKEN || '';
delete process.env.KUBEOPS_LAUNCH_TOKEN;
const parentPid = Number.parseInt(process.env.KUBEOPS_PARENT_PID || '', 10);
delete process.env.KUBEOPS_PARENT_PID;
const LAUNCH_PATH = '/__kubeops/launch';

function hasLaunchToken(req: IncomingMessage): boolean {
  const header = req.headers['x-kubeops-launch-token'];
  if (!launchToken || typeof header !== 'string') return false;
  const expected = Buffer.from(launchToken);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// A bug in one request/stream handler (e.g. a throw from a client-node
// callback) must not take down every open terminal, log stream and port
// forward with it. Log and keep serving.
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception (continuing):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (continuing):', reason);
});

// Replaced with the graceful shutdown once the server is up.
let requestShutdown: () => void = () => process.exit(0);

// When launched by Electron, never outlive it. If the shell crashes or is
// force-killed, an orphaned server keeps port 51230 (and its kubectl
// children) and the next launch cannot start. stdin is a pipe from the
// parent: it closes when the parent dies, and also carries an explicit
// "shutdown" request — the only graceful option on Windows, where kill()
// terminates without running signal handlers.
if (Number.isInteger(parentPid) && parentPid > 0) {
  let stdinBuffer = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    stdinBuffer = (stdinBuffer + chunk).slice(-1024);
    if (stdinBuffer.split(/\r?\n/).some((line) => line.trim() === 'shutdown')) requestShutdown();
  });
  process.stdin.on('end', () => requestShutdown());
  process.stdin.on('error', () => requestShutdown());
  process.stdin.resume();

  // Belt and braces for platforms where the pipe does not close promptly.
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EPERM') requestShutdown();
    }
  }, 2000).unref();
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (!isAllowedLocalHost(req.headers.host, port)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (req.url === LAUNCH_PATH) {
      const ok = hasLaunchToken(req);
      res.writeHead(ok ? 200 : 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok }));
      return;
    }
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wssLogs = new WebSocketServer({ noServer: true });
  const wssExec = new WebSocketServer({ noServer: true });
  const wssWatch = new WebSocketServer({ noServer: true });

  // A synchronous throw inside a 'connection' listener propagates out of the
  // 'upgrade' listener and would crash the server (e.g. a half-written
  // ~/.kube/config makes loadFromDefault throw). Report it on the socket.
  const safeConnection = (
    name: string,
    handler: (ws: WebSocket, req: IncomingMessage) => void,
  ) => (ws: WebSocket, req: IncomingMessage) => {
    try {
      handler(ws, req);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[${name}] Connection handler failed:`, err);
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // `message` for the logs/exec clients, `error` + `resourceType` for watch.
          ws.send(JSON.stringify({ type: 'error', resourceType: '', message, error: message }));
          ws.close(1011, 'Internal server error');
        }
      } catch {
        ws.terminate();
      }
    }
  };

  wssLogs.on('connection', safeConnection('Logs', handleLogsConnection));
  wssExec.on('connection', safeConnection('Exec', handleExecConnection));
  wssWatch.on('connection', safeConnection('Watch', handleWatchConnection));

  server.on('upgrade', (request, socket, head) => {
    try {
      routeUpgrade(request, socket, head);
    } catch (err) {
      console.error('[Server] WebSocket upgrade failed:', err);
      socket.destroy();
    }
  });

  function routeUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const rejectUpgrade = () => {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
    };

    if (!isAllowedLocalHost(request.headers.host, port)) {
      rejectUpgrade();
      return;
    }

    let pathname: string;
    try {
      if (!request.url) throw new Error('Missing upgrade URL');
      pathname = new URL(request.url, `http://${hostname}:${port}`).pathname;
    } catch {
      rejectUpgrade();
      return;
    }

    const isApplicationSocket = pathname?.startsWith('/ws/logs/')
      || pathname?.startsWith('/ws/exec/')
      || pathname?.startsWith('/ws/watch/');

    if (isApplicationSocket) {
      if (!isAllowedWebSocketUpgrade({
        host: request.headers.host,
        origin: request.headers.origin,
        nonce: undefined,
        requestUrl: request.url,
        expectedNonce: sessionNonce,
        port,
      })) {
        rejectUpgrade();
        return;
      }
    }

    if (pathname?.startsWith('/ws/logs/')) {
      wssLogs.handleUpgrade(request, socket, head, (ws) => {
        wssLogs.emit('connection', ws, request);
      });
    } else if (pathname?.startsWith('/ws/exec/')) {
      wssExec.handleUpgrade(request, socket, head, (ws) => {
        wssExec.emit('connection', ws, request);
      });
    } else if (pathname?.startsWith('/ws/watch/')) {
      wssWatch.handleUpgrade(request, socket, head, (ws) => {
        wssWatch.emit('connection', ws, request);
      });
    } else if (!dev) {
      // Nothing else upgrades in production. Leaving the socket open let any
      // local client park connections on the server indefinitely.
      socket.destroy();
    }
    // In dev, Next.js attaches its own 'upgrade' listener for HMR.
  }

  // Cleanup child processes on shutdown.
  //
  // The registry lives on globalThis rather than in the route module: this
  // bundle and the Next-loaded route are separate module instances, so
  // requiring the route here used to hand back an empty map and leave every
  // `kubectl port-forward` child running after the app quit.
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('> Shutting down — cleaning up child processes...');

    killAllForwards();

    // Terminating the sockets fires each handler's 'close', which kills the
    // exec PTYs; give that a tick to run before exiting.
    wssLogs.clients.forEach((ws) => ws.terminate());
    wssExec.clients.forEach((ws) => ws.terminate());
    wssWatch.clients.forEach((ws) => ws.terminate());
    shutdownAllWatchManagers();

    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  requestShutdown = shutdown;

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`> Port ${port} is already in use — is another KubeOps (or another app) running?`);
      process.exit(EXIT_ADDRESS_IN_USE);
    }
    console.error('> Server error:', err);
    process.exit(1);
  });

  server.listen(port, hostname, () => {
    console.log(`> KubeOps running on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('> Failed to start KubeOps server:', err);
  process.exit(1);
});
