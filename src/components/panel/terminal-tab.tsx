'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { PanelTab } from '@/stores/panel-store';

interface TerminalTabProps {
  tab: PanelTab;
  active: boolean;
}

export function TerminalTab({ tab, active }: TerminalTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const [connected, setConnected] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const initDone = useRef(false);

  const focusTerminal = useCallback(() => {
    if (termRef.current) {
      termRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!container || !terminalRef.current || initDone.current) return;
    initDone.current = true;

    let term: Terminal;
    let fitAddon: FitAddon;
    let ws: WebSocket;
    let disposed = false;

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

      // WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const decodedCluster = decodeURIComponent(clusterId);
      const wsUrl = `${protocol}//${window.location.host}/ws/exec/${encodeURIComponent(decodedCluster)}/${namespace}/${podName}?container=${container}`;

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Send initial terminal size
        sendResize(ws, term);
        term.focus();
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'connected') return;
            if (msg.type === 'exit') {
              term.writeln(`\r\n\x1b[33m${msg.reason || 'Session ended'}\x1b[0m`);
              setConnected(false);
              return;
            }
            if (msg.type === 'error') {
              term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`);
              return;
            }
          } catch {
            // Not JSON - terminal output from PTY
          }
          term.write(event.data);
        } else {
          term.write(new Uint8Array(event.data));
        }
      };

      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);

      // Keyboard input → WebSocket stdin
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          const encoder = new TextEncoder();
          const encoded = encoder.encode(data);
          const buffer = new Uint8Array(encoded.length + 1);
          buffer[0] = 0; // type: stdin
          buffer.set(encoded, 1);
          ws.send(buffer);
        }
      });

      // Terminal resize → WebSocket resize event
      term.onResize(() => {
        sendResize(ws, term);
      });

      // Watch container size changes
      const ro = new ResizeObserver(() => {
        if (!disposed) {
          try { fitAddon.fit(); } catch { /* ignore */ }
        }
      });
      ro.observe(terminalRef.current!);

      return () => ro.disconnect();
    }

    function sendResize(ws: WebSocket, term: Terminal) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const payload = JSON.stringify({ cols: term.cols || 80, rows: term.rows || 24 });
      const buf = new Uint8Array(payload.length + 1);
      buf[0] = 1; // type: resize
      for (let i = 0; i < payload.length; i++) buf[i + 1] = payload.charCodeAt(i);
      ws.send(buf);
    }

    const cleanup = init();

    return () => {
      disposed = true;
      initDone.current = false;
      cleanup.then((fn) => fn?.());
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [container, clusterId, namespace, podName]);

  // Pause/resume WebSocket when tab is hidden for >5 minutes to save resources
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleClosedRef = useRef(false);

  useEffect(() => {
    if (active) {
      // Tab became active
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (idleClosedRef.current) {
        // WebSocket was closed due to idle — user needs to re-open the tab
        idleClosedRef.current = false;
        initDone.current = false;
        // Force re-init by simulating a remount would be complex;
        // instead just show a "reconnect" message if disconnected
      }
      setTimeout(() => {
        try { fitRef.current?.fit(); } catch { /* ignore */ }
        focusTerminal();
      }, 50);
    } else {
      // Tab became hidden — start idle timer (5 minutes)
      if (!idleTimerRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        idleTimerRef.current = setTimeout(() => {
          if (!active && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.close();
            idleClosedRef.current = true;
          }
          idleTimerRef.current = null;
        }, 5 * 60 * 1000);
      }
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [active, focusTerminal]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1 border-b bg-card shrink-0">
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-muted-foreground">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
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
