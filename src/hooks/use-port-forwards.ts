import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import type { PortForwardInfo } from '@/lib/port-forward-client';

/**
 * A `kubectl port-forward` child dies on its own whenever the pod restarts or
 * the cluster connection drops, and the server drops it from the registry. With
 * no polling the UI kept advertising a tunnel that was already gone, so the
 * localhost link just failed with no explanation.
 */
const POLL_INTERVAL_MS = 5000;

// Module scope: several components mount this hook, and a stop initiated in one
// of them must not read as an unexpected drop in the others.
const stoppedByUser = new Set<string>();

export function usePortForwards() {
  const { data, mutate } = useSWR<{ forwards: PortForwardInfo[] }>('/api/port-forward', {
    refreshInterval: POLL_INTERVAL_MS,
    revalidateOnFocus: true,
  });

  const forwards: PortForwardInfo[] = useMemo(() => data?.forwards ?? [], [data]);

  // Announce forwards that disappeared without the user stopping them.
  const knownRef = useRef<Map<string, PortForwardInfo>>(new Map());

  useEffect(() => {
    if (!data) return;
    const current = new Map(forwards.map((f) => [f.id, f] as const));

    for (const [id, previous] of knownRef.current) {
      const now = current.get(id);
      // The server keeps a died forward listed with status 'error' (and the
      // kubectl reason) for a while, so treat that transition as the drop.
      if (now && now.status === 'error' && previous.status !== 'error') {
        if (stoppedByUser.delete(id)) continue;
        toast.warning('Port forward stopped', {
          id: `pf-lost-${id}`,
          description: `localhost:${previous.localPort} → ${previous.resourceName}:${previous.containerPort} failed${now.error ? `: ${now.error}` : '.'}`,
        });
        continue;
      }
      if (now) continue;
      if (previous.status === 'error') continue;
      if (stoppedByUser.delete(id)) continue;
      toast.warning('Port forward stopped', {
        id: `pf-lost-${id}`,
        description: `localhost:${previous.localPort} → ${previous.resourceName}:${previous.containerPort} is no longer available.`,
      });
    }

    knownRef.current = current;
  }, [data, forwards]);

  /**
   * Mark an id as intentionally stopped so its removal is not reported. Call it
   * before the DELETE so a poll landing mid-request is not read as a drop, and
   * undo it with `unmarkStopped` if the stop fails.
   */
  const markStopped = useCallback((id: string) => {
    stoppedByUser.add(id);
  }, []);

  /** Undo {@link markStopped} when the stop request itself failed. */
  const unmarkStopped = useCallback((id: string) => {
    stoppedByUser.delete(id);
  }, []);

  return { forwards, mutate, markStopped, unmarkStopped };
}
