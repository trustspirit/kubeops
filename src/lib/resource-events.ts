import type { KubeResource } from '@/types/resource';

export interface ResourceEventRow {
  key: string;
  type: string;
  reason: string;
  message: string;
  count: number;
  timestamp?: string;
  source?: string;
}

interface EventLike extends KubeResource {
  involvedObject?: { kind?: string; name?: string; uid?: string };
  regarding?: { kind?: string; name?: string; uid?: string };
  type?: string;
  reason?: string;
  message?: string;
  note?: string;
  count?: number;
  lastTimestamp?: string;
  eventTime?: string;
  firstTimestamp?: string;
  series?: { count?: number; lastObservedTime?: string };
  source?: { component?: string };
  reportingComponent?: string;
}

/**
 * Events about one object, newest first.
 *
 * A UID match is preferred: a pod recreated under the same name (StatefulSets)
 * otherwise shows the previous incarnation's events as if they were its own.
 */
export function selectEventsFor(
  events: readonly KubeResource[],
  target: { kind: string; name: string; uid?: string },
): ResourceEventRow[] {
  const rows: ResourceEventRow[] = [];

  for (const raw of events) {
    const event = raw as EventLike;
    const ref = event.involvedObject ?? event.regarding;
    if (!ref || ref.kind !== target.kind || ref.name !== target.name) continue;
    if (target.uid && ref.uid && ref.uid !== target.uid) continue;

    const timestamp = event.series?.lastObservedTime
      || event.lastTimestamp
      || event.eventTime
      || event.firstTimestamp
      || event.metadata?.creationTimestamp;

    rows.push({
      key: event.metadata?.uid || `${event.metadata?.name}-${timestamp}`,
      type: event.type || 'Normal',
      reason: event.reason || '-',
      message: event.message || event.note || '',
      count: event.series?.count || event.count || 1,
      timestamp,
      source: event.source?.component || event.reportingComponent || undefined,
    });
  }

  return rows.sort((a, b) => (Date.parse(b.timestamp ?? '') || 0) - (Date.parse(a.timestamp ?? '') || 0));
}
