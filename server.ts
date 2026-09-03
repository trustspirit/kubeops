// Suppress punycode deprecation warning from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) return;
  console.warn(warning.name, warning.message);
});

import { randomBytes } from 'crypto';
import { createServer } from 'http';
import { parse } from 'url';
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

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (!isAllowedLocalHost(req.headers.host, port)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wssLogs = new WebSocketServer({ noServer: true });
  const wssExec = new WebSocketServer({ noServer: true });
  const wssWatch = new WebSocketServer({ noServer: true });

  wssLogs.on('connection', (ws: WebSocket, req) => {
    handleLogsConnection(ws, req);
  });

  wssExec.on('connection', (ws: WebSocket, req) => {
    handleExecConnection(ws, req);
  });

  wssWatch.on('connection', (ws: WebSocket, req) => {
    handleWatchConnection(ws, req);
  });

  server.on('upgrade', (request, socket, head) => {
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
    } else {
      // Let Next.js handle HMR and other upgrades
    }
  });

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

  server.listen(port, hostname, () => {
    console.log(`> KubeOps running on http://${hostname}:${port}`);
  });
});
