import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import * as k8s from '@kubernetes/client-node';
import { parse } from 'url';
import { PassThrough } from 'stream';
import fetch from 'node-fetch';
import { StringDecoder } from 'string_decoder';
import { getKubeConfigForContext } from '../src/lib/k8s/kubeconfig-manager';
import { normalizeLogTailLines } from '../src/lib/log-request';
import { isDns1123Label, isDns1123Subdomain, isSafeCliScalar } from '../src/lib/exec-validation';

// Stop reading from the API server once this much converted output is still
// queued on the socket. Without it a chatty pod can grow the send buffer
// without bound while the renderer is busy painting.
const MAX_SOCKET_BACKLOG_BYTES = 1024 * 1024;
const KEEPALIVE_INTERVAL_MS = 30_000;

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
  const { pathname, query } = parse(req.url ?? '', true);
  const parts = pathname ? pathname.split('/').filter(Boolean) : [];

  // parts: ['ws', 'logs', clusterId, namespace, podName]
  let clusterId: string | undefined;
  let namespace: string | undefined;
  let podName: string | undefined;
  try {
    clusterId = parts[2] === undefined ? undefined : decodeURIComponent(parts[2]);
    namespace = parts[3] === undefined ? undefined : decodeURIComponent(parts[3]);
    podName = parts[4] === undefined ? undefined : decodeURIComponent(parts[4]);
  } catch {
    // A malformed percent-escape must not escape this handler: an exception
    // here propagates out of the 'connection' listener and kills the server.
    sendError(ws, 'Malformed log request URL');
    return;
  }

  const container = firstQueryValue(query.container);
  const follow = query.follow === 'true';
  const timestamps = query.timestamps === 'true';
  const tailLines = normalizeLogTailLines(firstQueryValue(query.tailLines));

  if (
    !isSafeCliScalar(clusterId)
    || !isDns1123Subdomain(namespace)
    || !isDns1123Subdomain(podName)
    || !isDns1123Label(container)
  ) {
    sendError(ws, 'Invalid cluster, namespace, pod, or container for log request');
    return;
  }

  let kc: k8s.KubeConfig;
  try {
    kc = getKubeConfigForContext(clusterId);
  } catch (err) {
    sendError(ws, err instanceof Error ? err.message : 'Unable to load kubeconfig');
    return;
  }

  const logStream = new PassThrough();
  const abortController = new AbortController();
  // Chunk boundaries fall wherever the network splits them, which is routinely
  // mid-codepoint. Decoding per chunk mangles any non-ASCII log line.
  const decoder = new StringDecoder('utf-8');
  let closed = false;
  let paused = false;

  const keepalive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, KEEPALIVE_INTERVAL_MS);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepalive);
    abortController.abort();
    logStream.destroy();
  };

  const drainIfPossible = () => {
    if (!paused || closed) return;
    if (ws.bufferedAmount > MAX_SOCKET_BACKLOG_BYTES) {
      setTimeout(drainIfPossible, 50);
      return;
    }
    paused = false;
    logStream.resume();
  };

  logStream.on('data', (chunk: Buffer) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const text = decoder.write(chunk);
    if (text) ws.send(text);
    if (!paused && ws.bufferedAmount > MAX_SOCKET_BACKLOG_BYTES) {
      paused = true;
      logStream.pause();
      setTimeout(drainIfPossible, 50);
    }
  });

  logStream.on('end', () => {
    const rest = decoder.end();
    if (rest && ws.readyState === WebSocket.OPEN) ws.send(rest);
    // The API server closed the stream (container exited, or follow=false
    // finished). Close cleanly so the client shows "disconnected" instead of
    // sitting on an open socket that will never carry data again. A JSON
    // `{type:'end'}` frame is deliberately not sent: the log views render any
    // non-'error' JSON as log text. The close code/reason carries the signal.
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'Log stream ended');
    cleanup();
  });

  logStream.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      ws.close();
    }
    cleanup();
  });

  streamPodLogs(kc, namespace, podName, container, logStream, abortController, {
    follow,
    timestamps,
    tailLines,
  })
    .catch((err) => {
      sendError(ws, err instanceof Error ? err.message : String(err));
      cleanup();
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

  ws.on('close', cleanup);
  ws.on('error', cleanup);
}
