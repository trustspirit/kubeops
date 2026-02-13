'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';

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
  const [shell, setShell] = useState('/bin/sh');
  const [connected, setConnected] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<any>(null);

  useEffect(() => {
    if (containers.length > 0 && !container) {
      setContainer(containers[0].name);
    }
  }, [containers, container]);

  useEffect(() => {
    if (!container || !terminalRef.current) return;

    let term: any;
    let fitAddon: any;

    async function init() {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

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

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/exec/${encodeURIComponent(decodeURIComponent(clusterId))}/${namespace}/${podName}?container=${container}&command=${encodeURIComponent(shell)}`;

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        term.writeln('Connected to pod...\r\n');
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'exit') {
              term.writeln(`\r\nProcess exited.`);
            } else if (msg.type === 'error') {
              term.writeln(`\r\nError: ${msg.message}`);
            }
          } catch {
            term.write(event.data);
          }
        } else {
          term.write(new Uint8Array(event.data));
        }
      };

      ws.onclose = () => {
        setConnected(false);
        term.writeln('\r\nConnection closed.');
      };

      ws.onerror = () => {
        setConnected(false);
      };

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          const buffer = new Uint8Array(data.length + 1);
          buffer[0] = 0;
          for (let i = 0; i < data.length; i++) {
            buffer[i + 1] = data.charCodeAt(i);
          }
          ws.send(buffer);
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalRef.current!);

      return () => {
        resizeObserver.disconnect();
      };
    }

    const cleanup = init();

    return () => {
      cleanup.then(fn => fn?.());
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, [container, shell, clusterId, namespace, podName]);

  if (!pod) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
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
                {containers.map((c: any) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={shell} onValueChange={setShell}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="/bin/sh">sh</SelectItem>
              <SelectItem value="/bin/bash">bash</SelectItem>
              <SelectItem value="/bin/zsh">zsh</SelectItem>
            </SelectContent>
          </Select>
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </div>
      <div ref={terminalRef} className="flex-1" />
    </div>
  );
}
