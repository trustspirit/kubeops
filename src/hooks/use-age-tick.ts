import { useEffect, useReducer } from 'react';

/**
 * Returns a tick counter that increments at the given interval (ms).
 * Each component gets its own timer scoped to the interval it needs.
 */
export function useAgeTick(intervalMs: number = 30_000): number {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const id = setInterval(bump, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}

/** Pick a tick interval based on how old the resource is. */
export function ageTickInterval(timestamp: string | undefined): number {
  if (!timestamp) return 60_000;
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 60_000) return 1_000;   // < 1 min → every 1s
  if (diffMs < 3_600_000) return 30_000; // < 1 hour → every 30s
  return 60_000;                          // >= 1 hour → every 60s
}
