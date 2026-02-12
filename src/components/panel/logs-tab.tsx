'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pause, Play, Download, ArrowDown } from 'lucide-react';
import AnsiToHtml from 'ansi-to-html';
import type { PanelTab } from '@/stores/panel-store';
import { usePanelStore } from '@/stores/panel-store';
import { useResourceList } from '@/hooks/use-resource-list';

const MAX_LOG_SIZE = 512 * 1024; // 512KB

function trimLogs(logs: string): string {
  if (logs.length <= MAX_LOG_SIZE) return logs;
  const trimmed = logs.slice(logs.length - MAX_LOG_SIZE);
  const firstNewline = trimmed.indexOf('\n');
  return firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed;
}

interface LogsTabProps {
  tab: PanelTab;
}

export function LogsTab({ tab }: LogsTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const updateTab = usePanelStore((s) => s.updateTab);
  const [follow, setFollow] = useState(true);
  const [logs, setLogs] = useState('');
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Batching: buffer incoming chunks between animation frames
  const bufferRef = useRef('');
  const rafRef = useRef<number>(0);

  // Per-instance converter (fresh state per pod/container switch)
  const converterRef = useRef(new AnsiToHtml({ fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true }));

  // Fetch all pods in namespace to find siblings
  const { data: podsData } = useResourceList({
    clusterId: clusterId ? decodeURIComponent(clusterId) : null,
    namespace,
    resourceType: 'pods',
    refreshInterval: 10000,
  });

  // Find current pod object and derive sibling pods + container list
  const currentPod = useMemo(() => {
    const allPods: any[] = podsData?.items || [];
    return allPods.find((p: any) => p.metadata?.name === podName);
  }, [podsData, podName]);

  const siblingPods = useMemo(() => {
    const allPods: any[] = podsData?.items || [];
    const ownerUid = currentPod?.metadata?.ownerReferences?.[0]?.uid;
    if (!ownerUid) return [];
    return allPods
      .filter((p: any) => p.metadata?.ownerReferences?.[0]?.uid === ownerUid)
      .map((p: any) => p.metadata?.name as string)
      .sort();
  }, [podsData, currentPod]);

  const containers = useMemo(() => {
    const regular: string[] = (currentPod?.spec?.containers || []).map((c: any) => c.name);
    const init: string[] = (currentPod?.spec?.initContainers || []).map((c: any) => c.name);
    return [...regular, ...init];
  }, [currentPod]);

  const flushBuffer = useCallback(() => {
    const chunk = bufferRef.current;
    if (!chunk) return;
    bufferRef.current = '';
    setLogs((prev) => trimLogs(prev + chunk));
  }, []);

  useEffect(() => {
    if (!container) return;

    // Reset converter state for new stream
    converterRef.current = new AnsiToHtml({ fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true });

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
            bufferRef.current += `\n[ERROR] ${msg.message}\n`;
            if (!rafRef.current) rafRef.current = requestAnimationFrame(flushBuffer);
            return;
          }
        } catch { /* not JSON */ }
        bufferRef.current += event.data;
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            flushBuffer();
          });
        }
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      bufferRef.current = '';
      setLogs('');
    };
  }, [container, clusterId, namespace, podName, follow, flushBuffer]);

  // Memoize ANSI conversion — only re-runs when logs change
  const logsHtml = useMemo(() => {
    if (!logs) return 'Connecting...';
    return converterRef.current.toHtml(logs);
  }, [logs]);

  useEffect(() => {
    if (follow && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logsHtml, follow]);

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

  const handlePodSwitch = (newPodName: string) => {
    if (newPodName === podName) return;
    updateTab(tab.id, {
      podName: newPodName,
      title: `logs: ${newPodName}/${container}`,
    });
  };

  const handleContainerSwitch = (newContainer: string) => {
    if (newContainer === container) return;
    updateTab(tab.id, {
      container: newContainer,
      title: `logs: ${podName}/${newContainer}`,
    });
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
        {siblingPods.length >= 2 && (
          <Select value={podName} onValueChange={handlePodSwitch}>
            <SelectTrigger size="sm" className="h-6 text-xs max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {siblingPods.map((name) => (
                <SelectItem key={name} value={name} className="text-xs">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {containers.length >= 2 && (
          <Select value={container} onValueChange={handleContainerSwitch}>
            <SelectTrigger size="sm" className="h-6 text-xs max-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {containers.map((name) => (
                <SelectItem key={name} value={name} className="text-xs">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-muted-foreground">{connected ? 'Streaming' : 'Disconnected'}</span>
        </div>
      </div>
      <pre
        ref={logRef}
        className="flex-1 min-h-0 overflow-auto bg-[#1e1e2e] text-[#cdd6f4] p-3 font-mono text-xs leading-5 whitespace-pre"
        dangerouslySetInnerHTML={{ __html: logsHtml }}
      />
    </div>
  );
}
