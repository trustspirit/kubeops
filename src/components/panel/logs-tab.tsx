'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play, Download, ArrowDown } from 'lucide-react';
import type { PanelTab } from '@/stores/panel-store';

interface LogsTabProps {
  tab: PanelTab;
}

export function LogsTab({ tab }: LogsTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const [follow, setFollow] = useState(true);
  const [logs, setLogs] = useState('');
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!container) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const decodedCluster = decodeURIComponent(clusterId);
    const wsUrl = `${protocol}//${window.location.host}/ws/logs/${encodeURIComponent(decodedCluster)}/${namespace}/${podName}?container=${container}&follow=${follow}&timestamps=true&tailLines=500`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'error') {
            setLogs((prev) => prev + `\n[ERROR] ${msg.message}\n`);
            return;
          }
        } catch { /* not JSON */ }
        setLogs((prev) => prev + event.data);
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      setLogs('');
    };
  }, [container, clusterId, namespace, podName, follow]);

  useEffect(() => {
    if (follow && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, follow]);

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${podName}-${container}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToBottom = () => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFollow(!follow)}>
          {follow ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          {follow ? 'Pause' : 'Follow'}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={scrollToBottom}>
          <ArrowDown className="h-3 w-3 mr-1" />
          Bottom
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleDownload}>
          <Download className="h-3 w-3 mr-1" />
          Download
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-muted-foreground">{connected ? 'Streaming' : 'Disconnected'}</span>
        </div>
      </div>
      <pre
        ref={logRef}
        className="flex-1 min-h-0 overflow-auto bg-[#1e1e2e] text-[#cdd6f4] p-3 font-mono text-xs leading-5 whitespace-pre"
      >
        {logs || 'Connecting...'}
      </pre>
    </div>
  );
}
