'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { PanelTab } from '@/stores/panel-store';
import { Button } from '@/components/ui/button';
import { buildWebSocketUrl } from '@/lib/websocket-session';
import {
  getInactiveExecDeadline,
  isInactiveExecExpired,
  shouldReconnectInactiveExecOnActivation,
} from '@/lib/exec-inactivity';
import { canRetryStream, getReconnectDelay } from '@/lib/stream-policy';

const MAX_RECONNECT_ATTEMPTS = 5;
const INACTIVE_TIMEOUT_MS = 5 * 60 * 1000;

function sendResize(socket: WebSocket | null, term: Terminal) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const payload = new TextEncoder().encode(JSON.stringify({
    cols: term.cols || 80,
    rows: term.rows || 24,
  }));
  const buffer = new Uint8Array(payload.length + 1);
  buffer[0] = 1;
  buffer.set(payload, 1);
  socket.send(buffer);
}

interface TerminalTabProps {
  tab: PanelTab;
  active: boolean;
}

export function TerminalTab({ tab, active }: TerminalTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const [connected, setConnected] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const normalExitRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleClosedRef = useRef(false);
  const inactiveDeadlineRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const focusTerminal = useCallback(() => {
    if (termRef.current) {
      termRef.current.focus();
    }
  }, []);

  const closeForInactivity = useCallback(() => {
    if (normalExitRef.current) return;
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const socket = wsRef.current;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      wsRef.current = null;
    }
    idleClosedRef.current = true;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!container || !terminalRef.current) return;

    let disposed = false;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let inputSubscription: { dispose(): void } | null = null;
    let resizeSubscription: { dispose(): void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      const xtermModule = await import('@xterm/xterm');
      const fitModule = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      if (disposed) return;

      term = new xtermModule.Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
          selectionBackground: '#585b70',
        },
      });
      termRef.current = term;

      fitAddon = new fitModule.FitAddon();
      fitRef.current = fitAddon;
      term.loadAddon(fitAddon);
      term.open(terminalRef.current!);
      fitAddon.fit();
      term.focus();

      inputSubscription = term.onData((data) => {
        const socket = wsRef.current;
        if (socket?.readyState !== WebSocket.OPEN) return;
        const encoded = new TextEncoder().encode(data);
        const buffer = new Uint8Array(encoded.length + 1);
        buffer[0] = 0;
        buffer.set(encoded, 1);
        socket.send(buffer);
      });

      resizeSubscription = term.onResize(() => {
        if (term) sendResize(wsRef.current, term);
      });

      resizeObserver = new ResizeObserver(() => {
        if (disposed) return;
        try { fitAddon?.fit(); } catch { /* terminal is being disposed */ }
      });
      resizeObserver.observe(terminalRef.current!);
      setTerminalReady(true);
    }

    void init();

    return () => {
      disposed = true;
      setTerminalReady(false);
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = wsRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        wsRef.current = null;
      }
      inputSubscription?.dispose();
      resizeSubscription?.dispose();
      resizeObserver?.disconnect();
      term?.dispose();
      if (termRef.current === term) termRef.current = null;
      fitRef.current = null;
    };
  }, [container, clusterId, namespace, podName]);

  useEffect(() => {
    const term = termRef.current;
    if (!container || !terminalReady || !term) return;

    let disposed = false;
    intentionalCloseRef.current = false;
    normalExitRef.current = false;
    reconnectAttemptsRef.current = 0;

    const detachSocketHandlers = (socket: WebSocket) => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    };

    const inactivityExpired = () => isInactiveExecExpired({
      active: activeRef.current,
      now: Date.now(),
      deadline: inactiveDeadlineRef.current,
    });

    const scheduleReconnect = () => {
      if (inactivityExpired()) {
        closeForInactivity();
        return;
      }
      const attempt = reconnectAttemptsRef.current;
      if (!canRetryStream({
        intentional: disposed || intentionalCloseRef.current,
        normalExit: normalExitRef.current,
        attempt,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
      })) {
        return;
      }
      reconnectAttemptsRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void connect(true);
      }, getReconnectDelay(attempt));
    };

    const connect = async (isRetry: boolean) => {
      if (disposed) return;
      if (inactivityExpired()) {
        closeForInactivity();
        return;
      }
      if (isRetry) {
        term.writeln('\r\n\x1b[33mReconnecting with a new shell session…\x1b[0m');
      }

      let wsUrl: string;
      try {
        const decodedCluster = decodeURIComponent(clusterId);
        wsUrl = await buildWebSocketUrl(
          `/ws/exec/${encodeURIComponent(decodedCluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}?container=${encodeURIComponent(container)}`,
        );
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : 'Unable to connect';
        term.writeln(`\r\n\x1b[31mError: ${message}\x1b[0m`);
        scheduleReconnect();
        return;
      }

      if (disposed) return;
      if (inactivityExpired()) {
        closeForInactivity();
        return;
      }
      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        if (inactivityExpired()) {
          closeForInactivity();
          return;
        }
        setConnected(true);
        sendResize(socket, term);
        term.focus();
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          term.write(new Uint8Array(event.data));
          return;
        }
        try {
          const message = JSON.parse(event.data) as { type?: string; reason?: string; message?: string };
          if (message.type === 'connected') return;
          if (message.type === 'exit') {
            normalExitRef.current = true;
            setConnected(false);
            term.writeln(`\r\n\x1b[33m${message.reason || 'Session ended'}\x1b[0m`);
            return;
          }
          if (message.type === 'error') {
            term.writeln(`\r\n\x1b[31mError: ${message.message || 'Unable to start session'}\x1b[0m`);
            return;
          }
        } catch {
          // PTY text is not JSON.
        }
        term.write(event.data);
      };

      socket.onerror = () => {
        if (!disposed) setConnected(false);
      };

      socket.onclose = () => {
        detachSocketHandlers(socket);
        if (wsRef.current === socket) wsRef.current = null;
        if (disposed) return;
        setConnected(false);
        scheduleReconnect();
      };
    };

    void connect(false);

    return () => {
      disposed = true;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = wsRef.current;
      if (socket) {
        detachSocketHandlers(socket);
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
        wsRef.current = null;
      }
    };
  }, [closeForInactivity, clusterId, container, namespace, podName, reconnectNonce, terminalReady]);

  // Pause/resume WebSocket when tab is hidden for >5 minutes to save resources
  useEffect(() => {
    const now = Date.now();
    const reconnectOnActivation = active && shouldReconnectInactiveExecOnActivation({
      now,
      inactiveDeadline: inactiveDeadlineRef.current,
      idleClosed: idleClosedRef.current,
      normalExit: normalExitRef.current,
    });

    inactiveDeadlineRef.current = getInactiveExecDeadline({
      active,
      now,
      currentDeadline: inactiveDeadlineRef.current,
      timeoutMs: INACTIVE_TIMEOUT_MS,
    });

    if (active) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (reconnectOnActivation) {
        closeForInactivity();
        idleClosedRef.current = false;
        reconnectAttemptsRef.current = 0;
        normalExitRef.current = false;
        intentionalCloseRef.current = true;
        setReconnectNonce((value) => value + 1);
      } else if (normalExitRef.current) {
        idleClosedRef.current = false;
      }
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        try { fitRef.current?.fit(); } catch { /* ignore */ }
        focusTerminal();
      }, 50);
    } else {
      const deadline = inactiveDeadlineRef.current;
      const delay = deadline === null ? INACTIVE_TIMEOUT_MS : Math.max(0, deadline - Date.now());
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        if (isInactiveExecExpired({
          active: activeRef.current,
          now: Date.now(),
          deadline: inactiveDeadlineRef.current,
        })) {
          closeForInactivity();
        }
      }, delay);
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [active, closeForInactivity, focusTerminal]);

  const reconnect = () => {
    reconnectAttemptsRef.current = 0;
    normalExitRef.current = false;
    intentionalCloseRef.current = true;
    termRef.current?.writeln('\r\n\x1b[36mStarting a new shell session…\x1b[0m');
    setReconnectNonce((value) => value + 1);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1 border-b bg-card shrink-0">
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-muted-foreground">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {!connected && (
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={reconnect} disabled={!terminalReady}>
            Reconnect
          </Button>
        )}
      </div>
      <div
        ref={terminalRef}
        className="flex-1 min-h-0"
        onClick={focusTerminal}
        onFocus={focusTerminal}
        style={{ cursor: 'text' }}
      />
    </div>
  );
}
