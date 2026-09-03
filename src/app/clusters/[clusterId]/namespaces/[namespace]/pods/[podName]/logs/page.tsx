'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { useLogSearch } from '@/hooks/use-log-search';
import { buildWebSocketUrl } from '@/lib/websocket-session';
import { canRetryStream, getReconnectDelay, isNearScrollBottom } from '@/lib/stream-policy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pause, Play, Download, Search, ChevronUp, ChevronDown, X, CaseSensitive, Regex, Scissors } from 'lucide-react';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { LogBuffer } from '@/lib/log-buffer';
import { downloadPodLogs } from '@/lib/log-download';
import AnsiToHtml from 'ansi-to-html';

const MAX_LOG_SIZE = 512 * 1024; // 512KB retained in the viewer
const MAX_RETRIES = 5;
/** Repaint at most this often instead of on every incoming chunk. */
const RENDER_INTERVAL_MS = 100;
type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const ANSI_OPTIONS = { fg: '#cdd6f4', bg: '#1e1e2e', escapeXML: true, stream: true } as const;

function createLogBuffer(): LogBuffer {
  const converter = new AnsiToHtml(ANSI_OPTIONS);
  return new LogBuffer({ maxChars: MAX_LOG_SIZE, convert: (raw) => converter.toHtml(raw) });
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
  const [baseHtml, setBaseHtml] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const logRef = useRef<HTMLPreElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStreamedRef = useRef(false);
  const logTargetRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<LogBuffer>(createLogBuffer());
  const pendingRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useLogSearch({
    html: baseHtml,
    logRef,
    onScrollToMatch: () => setFollow(false),
  });

  const flushBuffer = useCallback(() => {
    flushTimerRef.current = null;
    const chunk = pendingRef.current;
    if (!chunk) return;
    pendingRef.current = '';

    const buffer = bufferRef.current;
    buffer.append(chunk);
    setBaseHtml(buffer.html);
    setTruncated(buffer.truncated);
    setHasOutput(true);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flushBuffer, RENDER_INTERVAL_MS);
  }, [flushBuffer]);


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
      pendingRef.current = '';
      bufferRef.current = createLogBuffer();
      setBaseHtml('');
      setTruncated(false);
      setHasOutput(false);
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
              pendingRef.current += `\n[ERROR] ${msg.message}\n`;
              scheduleFlush();
              return;
            }
          } catch { /* not JSON, it's log data */ }
          pendingRef.current += event.data;
          scheduleFlush();
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
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      pendingRef.current = '';
    };
  }, [container, clusterId, namespace, podName, reconnectNonce, scheduleFlush]);

  const { open: openSearch, highlightedHtml } = search;
  const logsHtml = hasOutput ? highlightedHtml : 'Connecting...';

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

  // Fetch the complete log rather than saving the trimmed on-screen buffer.
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPodLogs({
        clusterId: decodeURIComponent(clusterId),
        namespace,
        podName,
        container,
        fallbackText: bufferRef.current.text,
      });
    } finally {
      setDownloading(false);
    }
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            title="Download the pod's full log"
          >
            <Download className="h-4 w-4 mr-1" />
            {downloading ? 'Downloading…' : 'Download'}
          </Button>
          {truncated && (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={`Only the most recent ${Math.round(MAX_LOG_SIZE / 1024)}KB is kept in view. Download for the full log.`}
            >
              <Scissors className="h-3 w-3" />
              Trimmed
            </span>
          )}
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
