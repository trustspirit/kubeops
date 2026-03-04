'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pause, Play, Download, ArrowDown, Search, ChevronUp, ChevronDown, X, CaseSensitive, Regex } from 'lucide-react';
import AnsiToHtml from 'ansi-to-html';
import type { PanelTab } from '@/stores/panel-store';
import { usePanelStore } from '@/stores/panel-store';
import { useResourceList } from '@/hooks/use-resource-list';
import { useLogSearch } from '@/hooks/use-log-search';
import type { KubeResource } from '@/types/resource';

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
    const allPods: KubeResource[] = podsData?.items || [];
    return allPods.find((p: KubeResource) => p.metadata?.name === podName);
  }, [podsData, podName]);

  const siblingPods = useMemo(() => {
    const allPods: KubeResource[] = podsData?.items || [];
    const ownerUid = currentPod?.metadata?.ownerReferences?.[0]?.uid;
    if (!ownerUid) return [];
    return allPods
      .filter((p: KubeResource) => p.metadata?.ownerReferences?.[0]?.uid === ownerUid)
      .map((p: KubeResource) => p.metadata?.name as string)
      .sort();
  }, [podsData, currentPod]);

  const containers = useMemo(() => {
    const podSpec = currentPod?.spec as Record<string, unknown> | undefined;
    const regular: string[] = ((podSpec?.containers || []) as { name: string }[]).map((c) => c.name);
    const init: string[] = ((podSpec?.initContainers || []) as { name: string }[]).map((c) => c.name);
    return [...regular, ...init];
  }, [currentPod]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const search = useLogSearch({
    logs,
    logRef,
    onScrollToMatch: () => setFollow(false),
  });

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
  const [baseHtml, setBaseHtml] = useState('Connecting...');
  useEffect(() => {
    if (!logs) { setBaseHtml('Connecting...'); return; }
    setBaseHtml(converterRef.current.toHtml(logs));
  }, [logs]);

  // Apply search highlighting on top of ANSI-converted HTML
  const logsHtml = useMemo(
    () => (search.query ? search.highlightHtml(baseHtml) : baseHtml),
    [baseHtml, search.query, search.highlightHtml]
  );

  useEffect(() => {
    if (follow && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logsHtml, follow]);

  // Cmd+F / Ctrl+F keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        search.open();
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [search.open]);

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
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => {
            search.open();
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
        >
          <Search className="h-3 w-3 mr-1" />
          Search
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
      {search.isOpen && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b bg-card shrink-0">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <Input
            ref={searchInputRef}
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.shiftKey ? search.goToPrev() : search.goToNext();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                search.close();
              }
            }}
            placeholder="Search logs..."
            className="h-6 text-xs flex-1 min-w-0 border-none shadow-none focus-visible:ring-0 px-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {search.query ? `${search.matchCount > 0 ? search.currentIndex + 1 : 0}/${search.matchCount}` : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 w-5 p-0 ${search.caseSensitive ? 'bg-muted' : ''}`}
            onClick={search.toggleCaseSensitive}
            title="Case Sensitive"
          >
            <CaseSensitive className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 w-5 p-0 ${search.useRegex ? 'bg-muted' : ''}`}
            onClick={search.toggleRegex}
            title="Regex"
          >
            <Regex className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={search.goToPrev} disabled={search.matchCount === 0}>
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={search.goToNext} disabled={search.matchCount === 0}>
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={search.close}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      <pre
        ref={logRef}
        className="flex-1 min-h-0 overflow-auto bg-[#1e1e2e] text-[#cdd6f4] p-3 font-mono text-xs leading-5 whitespace-pre"
        dangerouslySetInnerHTML={{ __html: logsHtml }}
      />
      <style jsx global>{`
        .log-highlight {
          background: #f9e2af33;
          color: #f9e2af;
          border-radius: 2px;
        }
        .log-highlight-active {
          background: #f9e2af66;
          outline: 1px solid #f9e2af;
        }
      `}</style>
    </div>
  );
}
