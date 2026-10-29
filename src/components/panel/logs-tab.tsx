'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pause, Play, Download, ArrowDown, Search, ChevronUp, ChevronDown, X, CaseSensitive, Regex, Scissors } from 'lucide-react';
import type { PanelTab } from '@/stores/panel-store';
import { usePanelStore } from '@/stores/panel-store';
import { useResourceList } from '@/hooks/use-resource-list';
import { useLogSearch } from '@/hooks/use-log-search';
import { describeLogConnection, listLogContainerNames, logConnectionDotClass, MAX_LOG_SIZE, useLogStream } from '@/hooks/use-log-stream';
import { isNearScrollBottom } from '@/lib/stream-policy';
import { downloadPodLogs } from '@/lib/log-download';
import type { KubeResource } from '@/types/resource';

interface LogsTabProps {
  tab: PanelTab;
  active?: boolean;
}

export function LogsTab({ tab, active = true }: LogsTabProps) {
  const { clusterId, namespace, podName, container } = tab;
  const updateTab = usePanelStore((s) => s.updateTab);
  const [follow, setFollow] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [podRecreated, setPodRecreated] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : '';
  const stream = useLogStream({ clusterId: decodedClusterId, namespace, podName, container, active });
  const { html: baseHtml, truncated, hasOutput, connectionState, reconnect, followNewPod } = stream;
  const podUidRef = useRef<string | undefined>(undefined);

  // Fetch all pods in namespace to find siblings
  const { data: podsData } = useResourceList({
    clusterId: decodedClusterId || null,
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

  const containers = useMemo(() => listLogContainerNames(currentPod), [currentPod]);

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
    html: baseHtml,
    logRef,
    onScrollToMatch: () => setFollow(false),
  });

  const { open: openSearch, highlightedHtml } = search;
  const logsHtml = hasOutput ? highlightedHtml : 'Connecting...';

  useEffect(() => {
    if (follow && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logsHtml, follow]);

  // Cmd+F / Ctrl+F: every open LogsTab is mounted, so only the visible one,
  // and only while focus is inside the bottom panel, may take the shortcut —
  // otherwise it would hijack find on the page above.
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        const focused = document.activeElement;
        const panel = rootRef.current?.closest('[data-bottom-panel]') ?? rootRef.current;
        if (!focused || !panel?.contains(focused)) return;
        e.preventDefault();
        openSearch();
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch, active]);

  // Downloading the on-screen buffer would silently hand the user a truncated
  // file, so fetch the pod's full log from the API instead.
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
    <div ref={rootRef} className="flex flex-col h-full">
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
                followNewPod();
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
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleDownload}
          disabled={downloading}
          title="Download the pod's full log"
        >
          <Download className="h-3 w-3 mr-1" />
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
          <div className={`h-2 w-2 rounded-full ${logConnectionDotClass(connectionState)}`} />
          <span className="text-xs text-muted-foreground">
            {describeLogConnection(connectionState)}
          </span>
          {(connectionState === 'disconnected' || connectionState === 'ended') && active && (
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
            aria-label="Search logs"
            aria-invalid={Boolean(search.regexError)}
            className="h-6 text-xs flex-1 min-w-0 border-none shadow-none focus-visible:ring-0 px-1"
          />
          {search.regexError && (
            <span className="text-xs text-destructive whitespace-nowrap shrink-0" role="alert">
              Invalid regex
            </span>
          )}
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
        tabIndex={0}
        aria-label="Log output"
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
