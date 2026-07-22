'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { useLogSearch } from '@/hooks/use-log-search';
import { buildWebSocketUrl } from '@/lib/websocket-session';
import { canRetryStream, getReconnectDelay, isNearScrollBottom } from '@/lib/stream-policy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pause, Play, Download, Search, ChevronUp, ChevronDown, X, CaseSensitive, Regex } from 'lucide-react';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import AnsiToHtml from 'ansi-to-html';

const MAX_LOG_SIZE = 512 * 1024; // 512KB
const MAX_RETRIES = 5;
type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

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
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStreamedRef = useRef(false);
  const logTargetRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const converterRef = useRef(new AnsiToHtml({ fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true }));

  const search = useLogSearch({
    logs,
    logRef,
    onScrollToMatch: () => setFollow(false),
  });

   
  useEffect(() => {
    if (containers.length > 0 && !container) {
      setContainer(containers[0].name);
    }
  }, [containers, container]);

  useEffect(() => {
    if (!container) return;

    const logTarget = `${podName}\u0000${container}`;
    if (logTargetRef.current !== logTarget) {
      logTargetRef.current = logTarget;
      retryRef.current = 0;
      hasStreamedRef.current = false;
      setLogs('');
      converterRef.current = new AnsiToHtml({ fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true });
    }

    let disposed = false;
    setConnectionState(retryRef.current > 0 ? 'reconnecting' : 'connecting');

    void (async () => {
      try {
        const decodedCluster = decodeURIComponent(clusterId);
        const tailLines = hasStreamedRef.current ? 0 : 500;
        const logPath = `/ws/logs/${encodeURIComponent(decodedCluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}?container=${encodeURIComponent(container)}&follow=true&timestamps=true&tailLines=${tailLines}`;
        const ws = new WebSocket(await buildWebSocketUrl(logPath));
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
              setLogs(prev => trimLogs(prev + `\n[ERROR] ${msg.message}\n`));
              return;
            }
          } catch { /* not JSON, it's log data */ }
          setLogs(prev => trimLogs(prev + event.data));
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
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [container, clusterId, namespace, podName, reconnectNonce]);

  // ANSI conversion + search highlighting
  const [baseHtml, setBaseHtml] = useState('Connecting...');
  useEffect(() => {
    if (!logs) { setBaseHtml('Connecting...'); return; }
    setBaseHtml(converterRef.current.toHtml(logs));
  }, [logs]);

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

  if (!pod) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back from pod logs">
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
          <Button variant="outline" size="sm" onClick={toggleFollow}>
            {follow ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {follow ? 'Pause' : 'Follow'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              openSearch();
              setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
          >
            <Search className="h-4 w-4 mr-1" />
            Search
          </Button>
          <div className={`h-2 w-2 rounded-full ${connectionState === 'connected' ? 'bg-green-500' : connectionState === 'reconnecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
          <span className="text-xs text-muted-foreground">
            {connectionState === 'connected' ? 'Streaming' : connectionState === 'reconnecting' ? 'Reconnecting…' : connectionState === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>
          {connectionState === 'disconnected' && (
            <Button variant="outline" size="sm" onClick={reconnect}>
              Reconnect
            </Button>
          )}
        </div>
      </div>
      {search.isOpen && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b bg-card shrink-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
            className="h-7 text-xs flex-1 min-w-0 border-none shadow-none focus-visible:ring-0 px-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {search.query ? `${search.matchCount > 0 ? search.currentIndex + 1 : 0}/${search.matchCount}` : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${search.caseSensitive ? 'bg-muted' : ''}`}
            onClick={search.toggleCaseSensitive}
            title="Case Sensitive"
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${search.useRegex ? 'bg-muted' : ''}`}
            onClick={search.toggleRegex}
            title="Regex"
          >
            <Regex className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={search.goToPrev} disabled={search.matchCount === 0}>
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={search.goToNext} disabled={search.matchCount === 0}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={search.close}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <pre
        ref={logRef}
        className="flex-1 overflow-auto bg-[#1e1e2e] text-[#cdd6f4] p-4 font-mono text-xs leading-5 whitespace-pre"
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
