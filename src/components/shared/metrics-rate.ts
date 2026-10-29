/**
 * Turns cumulative Prometheus byte counters into KB/s rates.
 *
 * Prometheus scrapes far less often than the UI polls, so most polls return
 * the same counters. Diffing every poll produced a spike followed by zeros;
 * here a rate is only recomputed when the sample actually changes, and held
 * until the next one. A counter that has not moved for {@link STALE_SAMPLE_MS}
 * really is idle and reads as zero.
 */
export interface CounterSample {
  /** Cumulative counter values, in bytes. */
  values: readonly number[];
  /** When the sample was first seen. */
  ts: number;
}

export interface CounterRateState {
  sample: CounterSample | null;
  /** KB/s, one per counter. */
  rates: number[];
}

export const STALE_SAMPLE_MS = 120_000;

export function createCounterRateState(size: number): CounterRateState {
  return { sample: null, rates: new Array<number>(size).fill(0) };
}

function sameValues(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function updateCounterRates(state: CounterRateState, values: readonly number[], now: number): CounterRateState {
  const previous = state.sample;
  if (!previous) return { sample: { values, ts: now }, rates: values.map(() => 0) };
  if (sameValues(previous.values, values)) return state;

  const dt = (now - previous.ts) / 1000;
  const rates = dt > 0
    ? values.map((value, index) => Math.max(0, (value - (previous.values[index] ?? 0)) / 1024 / dt))
    : state.rates;
  return { sample: { values, ts: now }, rates };
}

/** Current rates for a chart point: held between samples, zero once stale. */
export function readCounterRates(state: CounterRateState, now: number): number[] {
  if (!state.sample || now - state.sample.ts > STALE_SAMPLE_MS) return state.rates.map(() => 0);
  return state.rates;
}
