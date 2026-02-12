// Suppress punycode deprecation warning from dependencies
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) return;
  console.warn(warning.name, warning.message);
});

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { handleLogsConnection } from './ws/logs-handler';
import { handleExecConnection } from './ws/exec-handler';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '51230', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wssLogs = new WebSocketServer({ noServer: true });
  const wssExec = new WebSocketServer({ noServer: true });

  wssLogs.on('connection', (ws: WebSocket, req) => {
    handleLogsConnection(ws, req);
  });

  wssExec.on('connection', (ws: WebSocket, req) => {
    handleExecConnection(ws, req);
  });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!);

    if (pathname?.startsWith('/ws/logs/')) {
      wssLogs.handleUpgrade(request, socket, head, (ws) => {
        wssLogs.emit('connection', ws, request);
      });
    } else if (pathname?.startsWith('/ws/exec/')) {
      wssExec.handleUpgrade(request, socket, head, (ws) => {
        wssExec.emit('connection', ws, request);
      });
    } else {
      // Let Next.js handle HMR and other upgrades
    }
  });

  // Cleanup child processes on shutdown
  const shutdown = () => {
    console.log('> Shutting down — cleaning up child processes...');
    try {
      const { cleanupAllForwards } = require('./src/app/api/port-forward/route');
      cleanupAllForwards();
    } catch { /* module may not be loaded yet */ }

    // Close all WebSocket connections
    wssLogs.clients.forEach((ws) => ws.terminate());
    wssExec.clients.forEach((ws) => ws.terminate());

    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    console.log(`> KubeOps running on http://${hostname}:${port}`);
  });
});
