import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as k8s from '@kubernetes/client-node';
import { parse } from 'url';
import { PassThrough } from 'stream';

export function handleExecConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname, query } = parse(req.url!, true);
  const parts = pathname!.split('/').filter(Boolean);
  // parts: ['ws', 'exec', clusterId, namespace, podName]
  const clusterId = decodeURIComponent(parts[2]);
  const namespace = parts[3];
  const podName = parts[4];
  const container = query.container as string;
  const command = (query.command as string) || '/bin/sh';

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  kc.setCurrentContext(clusterId);

  const exec = new k8s.Exec(kc);

  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();
  const stdinStream = new PassThrough();

  stdoutStream.on('data', (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    }
  });

  stderrStream.on('data', (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    }
  });

  ws.on('message', (data: Buffer) => {
    if (data.length === 0) return;

    const type = data[0];
    const payload = data.subarray(1);

    if (type === 0) {
      // stdin data
      stdinStream.write(payload);
    } else if (type === 1) {
      // resize event
      try {
        const { cols, rows } = JSON.parse(payload.toString());
        // Terminal resize - the k8s exec API handles this via the status channel
        // For now we just handle stdin/stdout
        void cols;
        void rows;
      } catch {
        // ignore parse errors
      }
    }
  });

  exec
    .exec(
      namespace,
      podName,
      container,
      [command],
      stdoutStream,
      stderrStream,
      stdinStream,
      true, // tty
      (status: k8s.V1Status) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', status }));
          ws.close();
        }
      }
    )
    .catch((err) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
      }
    });

  ws.on('close', () => {
    stdinStream.destroy();
    stdoutStream.destroy();
    stderrStream.destroy();
  });

  ws.on('error', () => {
    stdinStream.destroy();
    stdoutStream.destroy();
    stderrStream.destroy();
  });
}
