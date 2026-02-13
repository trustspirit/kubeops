import { useSyncExternalStore } from 'react';

const INTERVAL_MS = 30_000;

let tick = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    tick++;
    listeners.forEach((l) => l());
  }, INTERVAL_MS);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) startTimer();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopTimer();
  };
}

function getSnapshot() {
  return tick;
}

/** Returns a counter that increments every 30s. All consumers share a single timer. */
export function useAgeTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
