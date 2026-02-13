'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgeDisplay } from '@/components/shared/age-display';
import { ArrowDown, Pause, ChevronDown, ChevronRight, Group } from 'lucide-react';

interface K8sEvent {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  lastTimestamp?: string;
  eventTime?: string;
  involvedObject?: {
    kind?: string;
    name?: string;
    namespace?: string;
    uid?: string;
  };
  metadata?: {
    uid?: string;
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface EventTimelineProps {
  events: K8sEvent[];
}

function EventCard({ event }: { event: K8sEvent }) {
  const isWarning = event.type === 'Warning';
  const involvedObj = event.involvedObject || {};
  const timestamp = event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp;

  return (
    <div className="flex gap-3">
      {/* Timeline dot and line */}
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
            isWarning ? 'bg-red-500' : 'bg-muted-foreground/40'
          }`}
        />
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Card content */}
      <div
        className={`flex-1 rounded-md border p-3 mb-3 text-sm ${
          isWarning ? 'border-red-500/50 bg-red-500/5' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isWarning ? 'destructive' : 'secondary'} className="text-[10px]">
              {event.type || 'Normal'}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono">
              {event.reason || '-'}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              {involvedObj.kind}/{involvedObj.name}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            <AgeDisplay timestamp={timestamp} />
            {event.count && event.count > 1 && (
              <span className="ml-1 text-muted-foreground">({event.count}x)</span>
            )}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{event.message || '-'}</p>
      </div>
    </div>
  );
}

// Limit the number of rendered events to prevent DOM performance issues
// with large event lists (clusters can produce thousands of events).
const INITIAL_RENDER_LIMIT = 200;
const RENDER_LIMIT_INCREMENT = 200;

export function EventTimeline({ events }: EventTimelineProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'Normal' | 'Warning'>('all');
  const [reasonFilter, setReasonFilter] = useState('');
  const [followMode, setFollowMode] = useState(true);
  const [groupByResource, setGroupByResource] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    if (typeFilter !== 'all') {
      filtered = filtered.filter((e) => e.type === typeFilter);
    }

    if (reasonFilter.trim()) {
      const q = reasonFilter.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          (e.reason || '').toLowerCase().includes(q) ||
          (e.message || '').toLowerCase().includes(q)
      );
    }

    // Sort newest first
    filtered.sort((a, b) => {
      const ta = new Date(a.lastTimestamp || a.eventTime || a.metadata?.creationTimestamp || 0).getTime();
      const tb = new Date(b.lastTimestamp || b.eventTime || b.metadata?.creationTimestamp || 0).getTime();
      return tb - ta;
    });

    return filtered;
  }, [events, typeFilter, reasonFilter]);

  const groupedEvents = useMemo(() => {
    if (!groupByResource) return null;

    const groups: Record<string, K8sEvent[]> = {};
    for (const event of filteredEvents) {
      const key = `${event.involvedObject?.kind || 'Unknown'}/${event.involvedObject?.name || 'unknown'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }

    return Object.entries(groups).sort((a, b) => {
      const latestA = new Date(a[1][0]?.lastTimestamp || a[1][0]?.metadata?.creationTimestamp || 0).getTime();
      const latestB = new Date(b[1][0]?.lastTimestamp || b[1][0]?.metadata?.creationTimestamp || 0).getTime();
      return latestB - latestA;
    });
  }, [filteredEvents, groupByResource]);

  // Truncate rendered events for DOM performance.
  // The render limit is managed via the renderLimit state. It starts at INITIAL_RENDER_LIMIT.
  // When the user changes filters, the filteredEvents array changes and we always show
  // the first INITIAL_RENDER_LIMIT items. The "show more" button increments the limit.
  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, renderLimit),
    [filteredEvents, renderLimit]
  );
  const hasMoreEvents = filteredEvents.length > renderLimit;

  // Auto-scroll on new events in follow mode
  useEffect(() => {
    if (followMode && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filteredEvents.length, followMode]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as 'all' | 'Normal' | 'Warning'); setRenderLimit(INITIAL_RENDER_LIMIT); }}>
          <SelectTrigger className="w-[130px]" size="sm">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Normal">Normal</SelectItem>
            <SelectItem value="Warning">Warning</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by reason..."
          value={reasonFilter}
          onChange={(e) => { setReasonFilter(e.target.value); setRenderLimit(INITIAL_RENDER_LIMIT); }}
          className="w-[200px] h-8 text-sm"
        />

        <Button
          variant={groupByResource ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGroupByResource(!groupByResource)}
        >
          <Group className="h-4 w-4 mr-1" />
          Group
        </Button>

        <Button
          variant={followMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFollowMode(!followMode)}
        >
          {followMode ? (
            <><Pause className="h-4 w-4 mr-1" />Following</>
          ) : (
            <><ArrowDown className="h-4 w-4 mr-1" />Follow</>
          )}
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">
          {filteredEvents.length} events
        </span>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="max-h-[600px] overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No events match the current filters.</p>
        ) : groupByResource && groupedEvents ? (
          <div className="space-y-2">
            {groupedEvents.map(([key, groupEvents]) => {
              const isCollapsed = collapsedGroups.has(key);
              const warningCount = groupEvents.filter((e) => e.type === 'Warning').length;

              return (
                <div key={key} className="rounded-md border">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => toggleGroup(key)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                    <span className="font-mono font-medium">{key}</span>
                    <span className="text-xs text-muted-foreground">({groupEvents.length})</span>
                    {warningCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] ml-auto">
                        {warningCount} warnings
                      </Badge>
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="px-3 pb-2">
                      {groupEvents.map((event: K8sEvent, i: number) => (
                        <EventCard
                          key={event.metadata?.uid || i}
                          event={event}
                          
                          
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {visibleEvents.map((event, i) => (
              <EventCard
                key={event.metadata?.uid || i}
                event={event}


              />
            ))}
          </div>
        )}
        {hasMoreEvents && (
          <div className="py-3 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenderLimit((prev) => prev + RENDER_LIMIT_INCREMENT)}
            >
              Show more ({filteredEvents.length - renderLimit} remaining)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
