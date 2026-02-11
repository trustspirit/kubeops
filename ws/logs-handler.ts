import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as k8s from '@kubernetes/client-node';
import { parse } from 'url';
import { PassThrough } from 'stream';

export function handleLogsConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname, query } = parse(req.url!, true);
  const parts = pathname!.split('/').filter(Boolean);
  // parts: ['ws', 'logs', clusterId, namespace, podName]
  const clusterId = decodeURIComponent(parts[2]);
  const namespace = parts[3];
  const podName = parts[4];
  const container = query.container as string;
  const follow = query.follow === 'true';
  const timestamps = query.timestamps === 'true';
  const tailLines = parseInt(query.tailLines as string) || 100;

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  kc.setCurrentContext(clusterId);

  const log = new k8s.Log(kc);
  const logStream = new PassThrough();

  logStream.on('data', (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk.toString('utf-8'));
    }
  });

  logStream.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      ws.close();
    }
  });

  log
    .log(namespace, podName, container, logStream, {
      follow,
      timestamps,
      tailLines,
    })
    .catch((err) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
      }
    });

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {
      // ignore non-JSON messages
    }
  });

  ws.on('close', () => {
    logStream.destroy();
  });

  ws.on('error', () => {
    logStream.destroy();
  });
}
