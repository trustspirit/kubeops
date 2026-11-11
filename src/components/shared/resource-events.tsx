'use client';

import { useMemo } from 'react';
import { useResourceList } from '@/hooks/use-resource-list';
import { AgeDisplay } from '@/components/shared/age-display';
import { selectEventsFor } from '@/lib/resource-events';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KubeResource } from '@/types/resource';

interface ResourceEventsProps {
  clusterId: string;
  namespace: string;
  kind: string;
  name: string;
  uid?: string;
  className?: string;
}

const MAX_EVENTS = 30;

/**
 * Recent events about one resource. This is the first place to look when a
 * pod will not start, so it sits on the detail page rather than only in the
 * namespace-wide Events list.
 */
export function ResourceEvents({ clusterId, namespace, kind, name, uid, className }: ResourceEventsProps) {
  const { data, error, isLoading } = useResourceList({
    clusterId,
    namespace,
    resourceType: 'events',
    enabled: Boolean(clusterId && namespace && name),
  });

  const rows = useMemo(
    () => selectEventsFor((data?.items ?? []) as KubeResource[], { kind, name, uid }),
    [data, kind, name, uid],
  );
  const warnings = rows.filter((row) => row.type === 'Warning').length;
  const visible = rows.slice(0, MAX_EVENTS);

  return (
    <section className={cn('space-y-2', className)} aria-label="Events">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Events</h3>
        {warnings > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {warnings} warning{warnings > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading && !data ? (
        <p className="rounded-md border px-3 py-3 text-xs text-muted-foreground">Loading events…</p>
      ) : error && !data ? (
        <p className="rounded-md border px-3 py-3 text-xs text-muted-foreground">
          Events could not be loaded{error instanceof Error && error.message ? `: ${error.message}` : '.'}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border px-3 py-3 text-xs text-muted-foreground">
          No recent events. Kubernetes keeps events for about an hour.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="w-[72px] px-3 py-1.5 font-medium">Age</th>
                <th className="w-[150px] px-3 py-1.5 font-medium">Reason</th>
                <th className="px-3 py-1.5 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const warning = row.type === 'Warning';
                return (
                  <tr key={row.key} className={cn('border-t align-top', warning && 'bg-amber-500/5')}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      <AgeDisplay timestamp={row.timestamp} />
                    </td>
                    <td className={cn('px-3 py-1.5 font-medium', warning && 'text-amber-700 dark:text-amber-400')}>
                      {row.reason}
                      {row.count > 1 && <span className="ml-1 font-normal text-muted-foreground">×{row.count}</span>}
                    </td>
                    <td className="break-words px-3 py-1.5">{row.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > visible.length && (
            <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              Showing the {visible.length} most recent of {rows.length} events.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
