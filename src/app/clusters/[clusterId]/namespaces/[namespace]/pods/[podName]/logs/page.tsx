'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useResourceDetail } from '@/hooks/use-resource-detail';
import { useLogSearch } from '@/hooks/use-log-search';
import { describeLogConnection, listLogContainerNames, logConnectionDotClass, MAX_LOG_SIZE, useLogStream } from '@/hooks/use-log-stream';
import { isNearScrollBottom } from '@/lib/stream-policy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pause, Play, Download, Search, ChevronUp, ChevronDown, X, CaseSensitive, Regex, Scissors } from 'lucide-react';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { ErrorDisplay } from '@/components/shared/error-display';
import { downloadPodLogs } from '@/lib/log-download';

export default function PodLogsPage() {
  const params = useParams();
  const router = useRouter();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const podName = params.podName as string;

  const decodedClusterId = decodeURIComponent(clusterId);
  const { data: pod, error: podError, mutate: mutatePod } = useResourceDetail({
    clusterId: decodedClusterId,
    namespace,
    resourceType: 'pods',
    name: podName,
  });

  // Init and ephemeral containers too, like the panel tab: a crash-looping
  // init container is often exactly the one whose logs are needed.
  const containers = useMemo(() => listLogContainerNames(pod), [pod]);
  const [container, setContainer] = useState('');
  const [follow, setFollow] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const stream = useLogStream({ clusterId: decodedClusterId, namespace, podName, container });
  const { html: baseHtml, truncated, hasOutput, connectionState, reconnect } = stream;

  const search = useLogSearch({
    html: baseHtml,
    logRef,
    onScrollToMatch: () => setFollow(false),
  });

  useEffect(() => {
    if (containers.length > 0 && !container) {
      setContainer(containers[0]);
    }
  }, [containers, container]);

  const { open: openSearch, highlightedHtml } = search;
  const logsHtml = hasOutput ? highlightedHtml : 'Connecting...';

  useEffect(() => {
    if (follow && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logsHtml, follow]);

  // Cmd+F / Ctrl+F keyboard shortcut (the bottom panel handles its own).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (document.activeElement?.closest('[data-bottom-panel]')) return;
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
        clusterId: decodedClusterId,
        namespace,
        podName,
        container,
        fallbackText: stream.getText(),
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

  if (!pod) {
    if (podError) return <ErrorDisplay error={podError} onRetry={() => mutatePod()} clusterId={clusterId} />;
    return <LoadingSkeleton />;
  }

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
                {containers.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
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
          <div className={`h-2 w-2 rounded-full ${logConnectionDotClass(connectionState)}`} />
          <span className="text-xs text-muted-foreground">
            {describeLogConnection(connectionState)}
          </span>
          {(connectionState === 'disconnected' || connectionState === 'ended') && (
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
