import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeFieldManagerConflict,
  isFieldManagerConflict,
  mapWithConcurrency,
  TimeoutError,
  withTimeout,
} from './apply-helpers';

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    assert.equal(await withTimeout(Promise.resolve(42), 1000, 'slow'), 42);
  });

  it('rejects with TimeoutError when it does not', async () => {
    await assert.rejects(
      withTimeout(new Promise(() => { /* never */ }), 10, 'too slow'),
      (err: unknown) => err instanceof TimeoutError && err.message === 'too slow',
    );
  });
});

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once and keeps input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    assert.deepEqual(out, [50, 10, 40, 20, 30, 0, 60]);
    assert.ok(peak <= 3, `peak ${peak}`);
  });

  it('handles an empty list', async () => {
    assert.deepEqual(await mapWithConcurrency([], 5, async () => 1), []);
  });
});

describe('isFieldManagerConflict', () => {
  const body = JSON.stringify({
    kind: 'Status',
    reason: 'Conflict',
    message: 'Apply failed with 1 conflict: conflict with "kubectl-client-side-apply" using apps/v1: .spec.replicas',
    details: { causes: [{ reason: 'FieldManagerConflict', field: '.spec.replicas' }] },
  });

  it('detects SSA conflicts from the Status body', () => {
    assert.equal(isFieldManagerConflict(409, body), true);
    assert.equal(isFieldManagerConflict(409, { message: 'Apply failed with 2 conflicts: ...' }), true);
  });

  it('ignores other 409s and other statuses', () => {
    assert.equal(isFieldManagerConflict(409, { reason: 'AlreadyExists', message: 'already exists' }), false);
    assert.equal(isFieldManagerConflict(422, body), false);
  });

  it('explains how to resolve it', () => {
    assert.match(describeFieldManagerConflict('Apply failed with 1 conflict'), /force/);
  });
});
