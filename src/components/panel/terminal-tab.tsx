'use client';

import { useEffect, useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PanelTab } from '@/stores/panel-store';

interface TerminalTabProps {
  tab: PanelTab;
}

export function TerminalTab({ tab }: TerminalTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const [shell, setShell] = useState('/bin/sh');
  const [connected, setConnected] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);

  useEffect(() => {
    if (!container || !terminalRef.current) return;

    let term: any;
    let disposed = false;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      if (disposed) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
        },
      });
      termRef.current = term;

      const fitAddon = new FitAddon();
      fitRef.current = fitAddon;
      term.loadAddon(fitAddon);
      term.open(terminalRef.current!);

      // Delay fit to ensure DOM is laid out
      requestAnimationFrame(() => {
        if (!disposed) fitAddon.fit();
      });

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const decodedCluster = decodeURIComponent(clusterId);
      const wsUrl = `${protocol}//${window.location.host}/ws/exec/${encodeURIComponent(decodedCluster)}/${namespace}/${podName}?container=${container}&command=${encodeURIComponent(shell)}`;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        term.writeln(`\x1b[2m# ${decodedCluster} / ${namespace} / ${podName} (${container})\x1b[0m\r\n`);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'connected') {
              // K8s exec WebSocket connected
              return;
            } else if (msg.type === 'exit') {
              term.writeln(`\r\n\x1b[33mProcess exited: ${msg.reason || 'unknown'}\x1b[0m`);
              if (msg.reason?.includes('not found') || msg.reason?.includes('forbidden') || msg.reason?.includes('Forbidden')) {
                term.writeln(`\x1b[2m  Check: kubectl auth can-i create pods/exec -n ${namespace}\x1b[0m`);
              }
              term.writeln(`\x1b[2m  Try a different shell or check RBAC permissions.\x1b[0m`);
              setConnected(false);
              return;
            } else if (msg.type === 'error') {
              term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`);
              if (msg.message?.includes('not found') || msg.message?.includes('forbidden')) {
                term.writeln(`\x1b[2m  Check RBAC: kubectl auth can-i create pods/exec -n ${namespace}\x1b[0m`);
              }
              return;
            }
          } catch {
            // Not JSON - treat as terminal output
          }
          term.write(event.data);
        } else {
          term.write(new Uint8Array(event.data));
        }
      };

      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          const encoder = new TextEncoder();
          const encoded = encoder.encode(data);
          const buffer = new Uint8Array(encoded.length + 1);
          buffer[0] = 0; // stdin type
          buffer.set(encoded, 1);
          ws.send(buffer);
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        if (!disposed) {
          try { fitAddon.fit(); } catch { /* ignore */ }
        }
      });
      resizeObserver.observe(terminalRef.current!);

      return () => resizeObserver.disconnect();
    }

    const cleanup = init();

    return () => {
      disposed = true;
      cleanup.then((fn) => fn?.());
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, [container, shell, clusterId, namespace, podName]);

  // Refit when panel resizes
  useEffect(() => {
    const interval = setInterval(() => {
      try { fitRef.current?.fit(); } catch { /* ignore */ }
    }, 300);
    const timer = setTimeout(() => clearInterval(interval), 2000);
    return () => { clearInterval(interval); clearTimeout(timer); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
        <Select value={shell} onValueChange={setShell}>
          <SelectTrigger className="w-[100px] h-6 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="/bin/sh">sh</SelectItem>
            <SelectItem value="/bin/bash">bash</SelectItem>
            <SelectItem value="/bin/zsh">zsh</SelectItem>
          </SelectContent>
        </Select>
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-muted-foreground">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  );
}
