'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { buildWebSocketUrl } from '@/lib/websocket-session';
import { ConnectionAttemptGate } from '@/lib/connection-attempt-gate';
import type { WatchSubscription, WatchMessage, WatchEvent } from '@/types/watch';

export type WatchConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type WatchEventCallback = (event: WatchEvent) => void;

interface ActiveSub {
  resourceType: string;
  namespace?: string;
  callbacks: Set<WatchEventCallback>;
}

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

export function useWatch(clusterId: string | null) {
  const [connectionState, setConnectionState] = useState<WatchConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<Map<string, ActiveSub>>(new Map());
  const backoffRef = useRef(MIN_BACKOFF);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const clusterIdRef = useRef(clusterId);
  const connectionAttemptGateRef = useRef(new ConnectionAttemptGate());

  // Keep clusterId ref up to date
  useEffect(() => { clusterIdRef.current = clusterId; });

  function subKey(resourceType: string, namespace?: string): string {
    return namespace ? `${resourceType}:${namespace}` : `${resourceType}:_cluster_`;
  }

  // Use a ref to break the circular dependency between connect and scheduleReconnect
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const connect = useCallback((): Promise<void> | void => {
    if (!clusterIdRef.current) return;
    if (!isMountedRef.current) return;
    if (subscriptionsRef.current.size === 0) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) return;

    return connectionAttemptGateRef.current.run(async attempt => {
      const connectingClusterId = clusterIdRef.current;
      if (!connectingClusterId) return;

      // Cancel any pending reconnect timer to avoid duplicate connections.
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Dispose a closed/replaced socket before beginning a fresh nonce request.
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }

      setConnectionState((prev) => (prev === 'disconnected' ? 'connecting' : 'reconnecting'));

      let url: string;
      try {
        url = await buildWebSocketUrl(`/ws/watch/${encodeURIComponent(connectingClusterId)}`);
      } catch {
        if (!attempt.isCurrent() || !isMountedRef.current || clusterIdRef.current !== connectingClusterId) return;
        setConnectionState('disconnected');
        scheduleReconnectRef.current();
        return;
      }

      if (
        !attempt.isCurrent()
        || !isMountedRef.current
        || clusterIdRef.current !== connectingClusterId
        || subscriptionsRef.current.size === 0
      ) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;
      const isCurrentSocket = () => (
        attempt.isCurrent()
        && isMountedRef.current
        && clusterIdRef.current === connectingClusterId
        && wsRef.current === ws
      );

      ws.onopen = () => {
        if (!isCurrentSocket() || subscriptionsRef.current.size === 0) {
          ws.close();
          return;
        }
        setConnectionState('connected');
        backoffRef.current = MIN_BACKOFF;

        // Re-subscribe all active subscriptions.
        for (const [, sub] of subscriptionsRef.current) {
          const msg: WatchSubscription = {
            action: 'subscribe',
            resourceType: sub.resourceType,
            namespace: sub.namespace,
          };
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onmessage = (event) => {
        if (!isCurrentSocket()) return;

        let msg: WatchMessage;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === 'event' && msg.event) {
          const key = subKey(msg.resourceType, msg.namespace);
          const sub = subscriptionsRef.current.get(key);
          if (sub) {
            for (const cb of sub.callbacks) {
              try { cb(msg.event); } catch { /* ignore */ }
            }
          }
        } else if (msg.type === 'error' && msg.event) {
          // Propagate error events to subscribers.
          const key = subKey(msg.resourceType, msg.namespace);
          const sub = subscriptionsRef.current.get(key);
          if (sub) {
            for (const cb of sub.callbacks) {
              try { cb(msg.event); } catch { /* ignore */ }
            }
          }
        }
        // 'subscribed' and 'unsubscribed' are acknowledgements — no action needed.
      };

      ws.onclose = () => {
        if (!isCurrentSocket()) return;
        wsRef.current = null;
        setConnectionState('disconnected');
        scheduleReconnectRef.current();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so reconnect is handled there.
      };
    });
  }, []); // No dependencies needed since we use refs

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (!clusterIdRef.current) return;
    if (subscriptionsRef.current.size === 0) return; // Don't reconnect if no subscriptions

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isMountedRef.current && clusterIdRef.current) {
        setConnectionState('reconnecting');
        connect();
      }
    }, delay);
  }, [connect]);

  // Keep the ref in sync
  useEffect(() => { scheduleReconnectRef.current = scheduleReconnect; });

  // Connect when clusterId changes
  useEffect(() => {
    const subs = subscriptionsRef.current;
    const connectionAttemptGate = connectionAttemptGateRef.current;
    if (!clusterId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectionState('disconnected');
      return;
    }

    // Only auto-connect if there are subscriptions or a connection is expected
    // The actual connect is triggered by the first subscribe call
    return () => {
      // Cleanup on clusterId change
      connectionAttemptGate.invalidate();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      subs.clear();
      backoffRef.current = MIN_BACKOFF;
      setConnectionState('disconnected');
    };
  }, [clusterId]);

  // Cleanup on unmount
  useEffect(() => {
    const connectionAttemptGate = connectionAttemptGateRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      connectionAttemptGate.invalidate();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Subscribe to watch events for a resource type and optional namespace.
   * Returns an unsubscribe function.
   */
  const subscribe = useCallback((
    resourceType: string,
    namespace: string | undefined,
    callback: WatchEventCallback,
  ): (() => void) => {
    const key = subKey(resourceType, namespace);

    let sub = subscriptionsRef.current.get(key);
    const isNewSub = !sub;

    if (!sub) {
      sub = { resourceType, namespace, callbacks: new Set() };
      subscriptionsRef.current.set(key, sub);
    }

    sub.callbacks.add(callback);

    // If this is a new subscription, send subscribe message
    if (isNewSub) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const msg: WatchSubscription = {
          action: 'subscribe',
          resourceType,
          namespace,
        };
        ws.send(JSON.stringify(msg));
      } else if (!ws || ws.readyState === WebSocket.CLOSED) {
        // Need to connect first
        connect();
      }
    }

    // Return unsubscribe function
    return () => {
      const currentSub = subscriptionsRef.current.get(key);
      if (!currentSub) return;

      currentSub.callbacks.delete(callback);

      if (currentSub.callbacks.size === 0) {
        subscriptionsRef.current.delete(key);

        // Send unsubscribe message
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          const msg: WatchSubscription = {
            action: 'unsubscribe',
            resourceType,
            namespace,
          };
          ws.send(JSON.stringify(msg));
        }

        // If no more subscriptions, disconnect
        if (subscriptionsRef.current.size === 0 && ws) {
          connectionAttemptGateRef.current.invalidate();
          ws.onclose = null;
          try { ws.close(); } catch { /* ignore */ }
          wsRef.current = null;
          setConnectionState('disconnected');
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        } else if (subscriptionsRef.current.size === 0) {
          connectionAttemptGateRef.current.invalidate();
          setConnectionState('disconnected');
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        }
      }
    };
  }, [connect]);

  return {
    subscribe,
    connectionState,
  };
}
