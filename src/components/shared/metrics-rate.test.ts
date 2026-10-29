import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCounterRateState, readCounterRates, STALE_SAMPLE_MS, updateCounterRates } from './metrics-rate';

describe('counter rates', () => {
  it('reports zero until a second sample arrives', () => {
    const state = updateCounterRates(createCounterRateState(1), [1024], 0);
    assert.deepEqual(readCounterRates(state, 0), [0]);
  });

  it('computes KB/s between changed samples', () => {
    let state = updateCounterRates(createCounterRateState(2), [0, 0], 0);
    state = updateCounterRates(state, [10 * 1024, 20 * 1024], 10_000);
    assert.deepEqual(readCounterRates(state, 10_000), [1, 2]);
  });

  it('holds the rate while polls return the same sample', () => {
    let state = updateCounterRates(createCounterRateState(1), [0], 0);
    state = updateCounterRates(state, [30 * 1024], 30_000);
    const held = updateCounterRates(state, [30 * 1024], 35_000);
    assert.equal(held, state);
    assert.deepEqual(readCounterRates(held, 35_000), [1]);
  });

  it('measures the rate from when the previous sample was first seen', () => {
    let state = updateCounterRates(createCounterRateState(1), [0], 0);
    state = updateCounterRates(state, [0], 5_000); // repeat poll, ignored
    state = updateCounterRates(state, [30 * 1024], 30_000);
    assert.deepEqual(readCounterRates(state, 30_000), [1]);
  });

  it('reads zero once the counters have been idle for a long time', () => {
    let state = updateCounterRates(createCounterRateState(1), [0], 0);
    state = updateCounterRates(state, [1024], 1_000);
    assert.deepEqual(readCounterRates(state, 1_000 + STALE_SAMPLE_MS + 1), [0]);
  });

  it('clamps counter resets to zero', () => {
    let state = updateCounterRates(createCounterRateState(1), [4096], 0);
    state = updateCounterRates(state, [0], 1_000);
    assert.deepEqual(readCounterRates(state, 1_000), [0]);
  });
});
