import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { parse } from 'url';
import { getWatchManager, type WatchCallback } from '../src/lib/k8s/watch-manager';
import type { WatchEvent, WatchSubscription, WatchMessage } from '../src/types/watch';

export function handleWatchConnection(ws: WebSocket, req: IncomingMessage) {
  const { pathname } = parse(req.url!, true);
  const parts = pathname ? pathname.split('/').filter(Boolean) : [];

  if (parts.length < 3 || !parts[2]) {
    ws.send(JSON.stringify({ type: 'error', resourceType: '', error: 'Missing clusterId in URL path' }));
    ws.close();
    return;
  }

  // parts: ['ws', 'watch', clusterId]
  let clusterId: string;
  try {
    clusterId = decodeURIComponent(parts[2]);
  } catch {
    ws.send(JSON.stringify({ type: 'error', resourceType: '', error: 'Malformed clusterId in URL' }));
    ws.close();
    return;
  }

  console.log(`[Watch] Client connected for cluster: ${clusterId}`);

  const manager = getWatchManager(clusterId);

  // Track active subscriptions for cleanup on disconnect
  const activeSubscriptions = new Map<string, { resourceType: string; namespace?: string; callback: WatchCallback }>();

  function subscriptionKey(resourceType: string, namespace?: string): string {
    return namespace ? `${resourceType}:${namespace}` : `${resourceType}:_cluster_`;
  }

  // Keepalive ping every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('message', (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    let data: string;
    if (Buffer.isBuffer(rawData)) {
      data = rawData.toString('utf-8');
    } else if (rawData instanceof ArrayBuffer) {
      data = Buffer.from(rawData).toString('utf-8');
    } else if (Array.isArray(rawData)) {
      data = Buffer.concat(rawData).toString('utf-8');
    } else {
      return;
    }

    let msg: WatchSubscription;
    try {
      msg = JSON.parse(data);
    } catch {
      sendMessage({
        type: 'error',
        resourceType: '',
        error: 'Invalid JSON message',
      });
      return;
    }

    // Validate required fields
    if (!msg.action || typeof msg.action !== 'string' || !msg.resourceType || typeof msg.resourceType !== 'string') {
      sendMessage({
        type: 'error',
        resourceType: msg.resourceType || '',
        error: 'Invalid message: action (string) and resourceType (string) are required',
      });
      return;
    }

    if (msg.action === 'subscribe') {
      const key = subscriptionKey(msg.resourceType, msg.namespace);

      // Don't double-subscribe
      if (activeSubscriptions.has(key)) {
        sendMessage({
          type: 'subscribed',
          resourceType: msg.resourceType,
          namespace: msg.namespace,
        });
        return;
      }

      const callback: WatchCallback = (event: WatchEvent) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const watchMsg: WatchMessage = {
          type: event.type === 'ERROR' ? 'error' : 'event',
          resourceType: msg.resourceType,
          namespace: msg.namespace,
          event,
          error: event.type === 'ERROR' ? event.object?.message : undefined,
        };
        sendMessage(watchMsg);
      };

      manager.subscribe(msg.resourceType, msg.namespace, callback);
      activeSubscriptions.set(key, {
        resourceType: msg.resourceType,
        namespace: msg.namespace,
        callback,
      });

      console.log(`[Watch] Subscribed to ${msg.resourceType}${msg.namespace ? '/' + msg.namespace : ''} on cluster ${clusterId}`);
      sendMessage({
        type: 'subscribed',
        resourceType: msg.resourceType,
        namespace: msg.namespace,
      });

    } else if (msg.action === 'unsubscribe') {
      const key = subscriptionKey(msg.resourceType, msg.namespace);
      const sub = activeSubscriptions.get(key);

      if (sub) {
        manager.unsubscribe(sub.resourceType, sub.namespace, sub.callback);
        activeSubscriptions.delete(key);
        console.log(`[Watch] Unsubscribed from ${msg.resourceType}${msg.namespace ? '/' + msg.namespace : ''} on cluster ${clusterId}`);
      }

      sendMessage({
        type: 'unsubscribed',
        resourceType: msg.resourceType,
        namespace: msg.namespace,
      });

    } else {
      sendMessage({
        type: 'error',
        resourceType: msg.resourceType || '',
        error: `Unknown action: ${(msg as unknown as Record<string, unknown>).action}`,
      });
    }
  });

  ws.on('close', () => {
    console.log(`[Watch] Client disconnected for cluster: ${clusterId}`);
    cleanup();
  });

  ws.on('error', (err: Error) => {
    console.error(`[Watch] WebSocket error for cluster ${clusterId}:`, err.message);
    // Note: 'close' event fires after 'error', but cleanup is idempotent
    cleanup();
  });

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(pingInterval);
    // Unsubscribe all active subscriptions
    for (const [, sub] of activeSubscriptions) {
      manager.unsubscribe(sub.resourceType, sub.namespace, sub.callback);
    }
    activeSubscriptions.clear();
  }

  function sendMessage(msg: WatchMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
