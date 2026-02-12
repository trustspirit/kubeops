'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pause, Play, Download, ArrowDown } from 'lucide-react';
import AnsiToHtml from 'ansi-to-html';
import type { PanelTab } from '@/stores/panel-store';
import { usePanelStore } from '@/stores/panel-store';
import { useResourceList } from '@/hooks/use-resource-list';

const ansiConverter = new AnsiToHtml({ fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true });

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
            setLogs((prev) => trimLogs(prev + `\n[ERROR] ${msg.message}\n`));
            return;
          }
        } catch { /* not JSON */ }
        setLogs((prev) => trimLogs(prev + event.data));
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
        dangerouslySetInnerHTML={{ __html: logs ? ansiConverter.toHtml(logs) : 'Connecting...' }}
      />
    </div>
  );
}
