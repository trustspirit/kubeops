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
      if (current.has(id)) continue;
      if (stoppedByUser.delete(id)) continue;
      toast.warning('Port forward stopped', {
        id: `pf-lost-${id}`,
        description: `localhost:${previous.localPort} → ${previous.resourceName}:${previous.containerPort} is no longer available.`,
      });
    }

    knownRef.current = current;
  }, [data, forwards]);

  /** Mark an id as intentionally stopped so its removal is not reported. */
  const markStopped = useCallback((id: string) => {
    stoppedByUser.add(id);
  }, []);

  return { forwards, mutate, markStopped };
}
