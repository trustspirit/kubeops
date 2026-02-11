import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as k8s from '@kubernetes/client-node';
import { parse } from 'url';
import { PassThrough } from 'stream';

export function handleExecConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname, query } = parse(req.url!, true);
  const parts = pathname!.split('/').filter(Boolean);
  const clusterId = decodeURIComponent(parts[2]);
  const namespace = parts[3];
  const podName = parts[4];
  const container = query.container as string;
  const command = (query.command as string) || '/bin/sh';

  console.log(`[Exec] Connecting: ${namespace}/${podName} (${container}) command="${command}"`);

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
      // Send stderr as visible output too
      ws.send(chunk);
    }
  });

  ws.on('message', (data: Buffer) => {
    if (data.length === 0) return;

    const type = data[0];
    const payload = data.subarray(1);

    if (type === 0) {
      stdinStream.write(payload);
    } else if (type === 1) {
      try {
        const { cols, rows } = JSON.parse(payload.toString());
        void cols;
        void rows;
      } catch {
        // ignore
      }
    }
  });

  exec
    .exec(
      namespace,
      podName,
      container,
      command,  // pass as string, not array - let the K8s API handle it
      stdoutStream,
      stderrStream,
      stdinStream,
      true,
      (status: k8s.V1Status) => {
        const code = (status as any)?.details?.causes?.[0]?.message || status?.message || status?.reason || 'unknown';
        console.log(`[Exec] Exit ${namespace}/${podName}: code=${code}`, JSON.stringify(status));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', reason: code, status }));
          ws.close();
        }
      }
    )
    .then((k8sWs) => {
      console.log(`[Exec] K8s WebSocket connected for ${namespace}/${podName}`);
      // Notify client that K8s exec is actually connected
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'connected' }));
      }

      // If K8s WebSocket closes, clean up
      k8sWs.on('close', () => {
        console.log(`[Exec] K8s WebSocket closed for ${namespace}/${podName}`);
      });

      k8sWs.on('error', (err: Error) => {
        console.error(`[Exec] K8s WebSocket error for ${namespace}/${podName}:`, err.message);
      });
    })
    .catch((err) => {
      console.error(`[Exec] Failed: ${namespace}/${podName}:`, err.message, err.stack);
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
