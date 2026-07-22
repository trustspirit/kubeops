import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as k8s from '@kubernetes/client-node';
import { parse } from 'url';
import { PassThrough } from 'stream';
import fetch from 'node-fetch';
import { getKubeConfigForContext } from '../src/lib/k8s/kubeconfig-manager';
import { normalizeLogTailLines } from '../src/lib/log-request';

type QueryValue = string | string[] | undefined;

interface LogRequestOptions {
  follow: boolean;
  timestamps: boolean;
  tailLines: number;
}

function firstQueryValue(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sendError(ws: WebSocket, message: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
    ws.close();
  }
}

async function parseK8sError(response: fetch.Response): Promise<string> {
  const fallback = `Kubernetes log request failed with HTTP ${response.status}`;

  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const body = JSON.parse(text) as { message?: string; reason?: string; code?: number };
      return body.message || body.reason || fallback;
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}

async function streamPodLogs(
  kc: k8s.KubeConfig,
  namespace: string,
  podName: string,
  container: string,
  stream: PassThrough,
  controller: AbortController,
  options: LogRequestOptions
): Promise<void> {
  const cluster = kc.getCurrentCluster();
  if (!cluster) {
    throw new Error('No currently active cluster');
  }

  const path = `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/log`;
  const requestUrl = new URL(path, cluster.server.endsWith('/') ? cluster.server : `${cluster.server}/`);

  requestUrl.searchParams.set('container', container);
  requestUrl.searchParams.set('follow', String(options.follow));
  requestUrl.searchParams.set('timestamps', String(options.timestamps));
  requestUrl.searchParams.set('tailLines', String(options.tailLines));

  const requestInit = await kc.applyToFetchOptions({});
  requestInit.signal = controller.signal;
  requestInit.method = 'GET';

  const response = await fetch(requestUrl.toString(), requestInit);
  if (!response.ok) {
    throw new Error(await parseK8sError(response));
  }

  if (!response.body) {
    throw new Error('Kubernetes log response did not include a stream body');
  }

  response.body.on('error', (err) => stream.destroy(err));
  response.body.pipe(stream);
}

export function handleLogsConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname, query } = parse(req.url!, true);
  const parts = pathname!.split('/').filter(Boolean);
  // parts: ['ws', 'logs', clusterId, namespace, podName]
  const clusterId = decodeURIComponent(parts[2]);
  const namespace = decodeURIComponent(parts[3] || '');
  const podName = decodeURIComponent(parts[4] || '');
  const container = firstQueryValue(query.container);
  const follow = query.follow === 'true';
  const timestamps = query.timestamps === 'true';
  const tailLines = normalizeLogTailLines(firstQueryValue(query.tailLines));

  if (!clusterId || !namespace || !podName || !container) {
    sendError(ws, 'Missing cluster, namespace, pod, or container for log request');
    return;
  }

  const kc = getKubeConfigForContext(clusterId);
  const logStream = new PassThrough();
  const abortController = new AbortController();

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

  streamPodLogs(kc, namespace, podName, container, logStream, abortController, {
    follow,
    timestamps,
    tailLines,
  })
    .catch((err) => {
      sendError(ws, err instanceof Error ? err.message : String(err));
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
    abortController.abort();
    logStream.destroy();
  });

  ws.on('error', () => {
    abortController.abort();
    logStream.destroy();
  });
}
