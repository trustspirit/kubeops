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
import { buildWebSocketUrl } from '@/lib/websocket-session';
import { canRetryStream, getReconnectDelay, isNearScrollBottom } from '@/lib/stream-policy';
import type { KubeResource } from '@/types/resource';

const MAX_LOG_SIZE = 512 * 1024; // 512KB
const MAX_RETRIES = 5;
type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

function trimLogs(logs: string): string {
  if (logs.length <= MAX_LOG_SIZE) return logs;
  const trimmed = logs.slice(logs.length - MAX_LOG_SIZE);
  const firstNewline = trimmed.indexOf('\n');
  return firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed;
}

interface LogsTabProps {
  tab: PanelTab;
  active?: boolean;
}

export function LogsTab({ tab, active = true }: LogsTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const updateTab = usePanelStore((s) => s.updateTab);
  const [follow, setFollow] = useState(true);
  const [logs, setLogs] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [podRecreated, setPodRecreated] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hasStreamedRef = useRef(false);
  const podUidRef = useRef<string | undefined>(undefined);
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logTargetRef = useRef<string | null>(null);

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

  const currentPodUid = currentPod?.metadata?.uid;
  useEffect(() => {
    if (!currentPodUid) return;
    if (!podUidRef.current) {
      podUidRef.current = currentPodUid;
      return;
    }
    if (podUidRef.current !== currentPodUid) setPodRecreated(true);
  }, [currentPodUid]);

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
    if (!container || !active) return;

    const logTarget = `${podName}\u0000${container}`;
    if (logTargetRef.current !== logTarget) {
      logTargetRef.current = logTarget;
      retryRef.current = 0;
      hasStreamedRef.current = false;
      bufferRef.current = '';
      setLogs('');
      converterRef.current = new AnsiToHtml({ fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true });
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    setConnectionState(retryRef.current > 0 ? 'reconnecting' : 'connecting');

    void (async () => {
      try {
        const decodedCluster = decodeURIComponent(clusterId);
        const tailLines = hasStreamedRef.current ? 0 : 500;
        const logPath = `/ws/logs/${encodeURIComponent(decodedCluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}?container=${encodeURIComponent(container)}&follow=true&timestamps=true&tailLines=${tailLines}`;
        ws = new WebSocket(await buildWebSocketUrl(logPath));
        if (disposed) {
          ws.close();
          return;
        }

        wsRef.current = ws;
        ws.onopen = () => {
          if (disposed) return;
          retryRef.current = 0;
          setConnectionState('connected');
        };
        ws.onmessage = (event) => {
          if (disposed || typeof event.data !== 'string') return;
          hasStreamedRef.current = true;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'error') {
              bufferRef.current += `\n[ERROR] ${msg.message}\n`;
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                  rafRef.current = 0;
                  flushBuffer();
                });
              }
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
        };
        ws.onclose = (event) => {
          if (disposed) return;
          if (event.wasClean) {
            setConnectionState('disconnected');
            return;
          }

          if (canRetryStream({ intentional: disposed, normalExit: false, attempt: retryRef.current, maxAttempts: MAX_RETRIES })) {
            const attempt = retryRef.current++;
            setConnectionState('reconnecting');
            reconnectTimerRef.current = setTimeout(
              () => setReconnectNonce((value) => value + 1),
              getReconnectDelay(attempt),
            );
          } else {
            setConnectionState('disconnected');
          }
        };
      } catch {
        if (!disposed) setConnectionState('disconnected');
      }
    })();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      bufferRef.current = '';
    };
  }, [container, clusterId, namespace, podName, flushBuffer, active, reconnectNonce]);

  // Memoize ANSI conversion — only re-runs when logs change
  const [baseHtml, setBaseHtml] = useState('Connecting...');
  useEffect(() => {
    if (!logs) { setBaseHtml('Connecting...'); return; }
    setBaseHtml(converterRef.current.toHtml(logs));
  }, [logs]);

  // Apply search highlighting on top of ANSI-converted HTML
  const { query, highlightHtml, open: openSearch } = search;
  const logsHtml = useMemo(
    () => (query ? highlightHtml(baseHtml) : baseHtml),
    [baseHtml, query, highlightHtml]
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
        openSearch();
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

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
    setFollow(true);
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  };

  const toggleFollow = () => {
    if (follow) setFollow(false);
    else scrollToBottom();
  };

  const reconnect = () => {
    retryRef.current = 0;
    setConnectionState('connecting');
    setReconnectNonce((value) => value + 1);
  };

  const handlePodSwitch = (newPodName: string) => {
    if (newPodName === podName) return;
    setFollow(true);
    updateTab(tab.id, {
      podName: newPodName,
      title: `logs: ${newPodName}/${container}`,
    });
  };

  const handleContainerSwitch = (newContainer: string) => {
    if (newContainer === container) return;
    setFollow(true);
    updateTab(tab.id, {
      container: newContainer,
      title: `logs: ${podName}/${newContainer}`,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
        {podRecreated && (
          <div className="flex items-center gap-2 rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-700 dark:text-yellow-400" role="status">
            Pod was recreated.
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-xs"
              onClick={() => {
                podUidRef.current = currentPodUid;
                setPodRecreated(false);
                setLogs((previous) => `${previous}\n--- following recreated pod ---\n`);
                hasStreamedRef.current = true;
                setReconnectNonce((value) => value + 1);
              }}
            >
              Follow new Pod
            </Button>
          </div>
        )}
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={toggleFollow}>
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
            openSearch();
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
          <div className={`h-2 w-2 rounded-full ${connectionState === 'connected' ? 'bg-green-500' : connectionState === 'reconnecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
          <span className="text-xs text-muted-foreground">
            {connectionState === 'connected' ? 'Streaming' : connectionState === 'reconnecting' ? 'Reconnecting…' : connectionState === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
          {connectionState === 'disconnected' && active && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={reconnect}>
              Reconnect
            </Button>
          )}
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
                if (e.shiftKey) search.goToPrev();
                else search.goToNext();
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
        onScroll={(event) => {
          const element = event.currentTarget;
          setFollow(isNearScrollBottom(element));
        }}
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
