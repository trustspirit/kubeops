'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pause, Play, Download } from 'lucide-react';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';

const MAX_LOG_SIZE = 512 * 1024; // 512KB

function trimLogs(logs: string): string {
  if (logs.length <= MAX_LOG_SIZE) return logs;
  const trimmed = logs.slice(logs.length - MAX_LOG_SIZE);
  const firstNewline = trimmed.indexOf('\n');
  return firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed;
}

export default function PodLogsPage() {
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
  const [follow, setFollow] = useState(true);
  const [logs, setLogs] = useState('');
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

   
  useEffect(() => {
    if (containers.length > 0 && !container) {
      setContainer(containers[0].name);
    }
  }, [containers, container]);

  useEffect(() => {
    if (!container) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/logs/${encodeURIComponent(decodeURIComponent(clusterId))}/${namespace}/${podName}?container=${container}&follow=${follow}&timestamps=true&tailLines=500`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'error') {
            setLogs(prev => trimLogs(prev + `\n[ERROR] ${msg.message}\n`));
            return;
          }
        } catch { /* not JSON, it's log data */ }
        setLogs(prev => trimLogs(prev + data));
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

  if (!pod) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Logs: {podName}</h1>
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
          <Button variant="outline" size="sm" onClick={() => setFollow(!follow)}>
            {follow ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {follow ? 'Pause' : 'Follow'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
      </div>
      <pre
        ref={logRef}
        className="flex-1 overflow-auto bg-[#1e1e2e] text-[#cdd6f4] p-4 font-mono text-xs leading-5 whitespace-pre"
      >
        {logs || 'Connecting...'}
      </pre>
    </div>
  );
}
