'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { buildWebSocketUrl } from '@/lib/websocket-session';
import { canRetryStream, getReconnectDelay } from '@/lib/stream-policy';

const MAX_RECONNECT_ATTEMPTS = 5;

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

export default function PodExecPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const podName = params.podName as string;

  const { data: pod } = useResourceDetail({
    clusterId: decodeURIComponent(clusterId),
    namespace,
    resourceType: 'pods',
    name: podName,
  });

  const containers = useMemo(() => pod?.spec?.containers || [], [pod]);
  const [container, setContainer] = useState('');
  const [connected, setConnected] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const normalExitRef = useRef(false);

  useEffect(() => {
    if (containers.length > 0 && !container) {
      setContainer(containers[0].name);
    }
  }, [containers, container]);

  useEffect(() => {
    if (!container || !terminalRef.current) return;

    let disposed = false;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let inputSubscription: { dispose(): void } | null = null;
    let resizeSubscription: { dispose(): void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      if (disposed) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
        },
      });
      termRef.current = term;

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current!);
      fitAddon.fit();

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

    const scheduleReconnect = () => {
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
      const socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
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
  }, [clusterId, container, namespace, podName, reconnectNonce, terminalReady]);

  const reconnect = () => {
    reconnectAttemptsRef.current = 0;
    normalExitRef.current = false;
    intentionalCloseRef.current = true;
    termRef.current?.writeln('\r\n\x1b[36mStarting a new shell session…\x1b[0m');
    setReconnectNonce((value) => value + 1);
  };

  if (!pod) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back from pod terminal">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Terminal: {podName}</h1>
        <div className="flex items-center gap-2 ml-auto">
          {containers.length > 1 && (
            <Select value={container} onValueChange={setContainer}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {containers.map((c: Record<string, unknown>) => (
                  <SelectItem key={c.name as string} value={c.name as string}>{c.name as string}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!connected && (
            <Button variant="outline" size="sm" onClick={reconnect} disabled={!terminalReady}>
              Reconnect
            </Button>
          )}
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </div>
      <div ref={terminalRef} className="flex-1" />
    </div>
  );
}
