import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLogTailLines } from './log-request';

describe('normalizeLogTailLines', () => {
  it('preserves zero so reconnecting follow streams do not replay history', () => {
    assert.equal(normalizeLogTailLines('0'), 0);
  });

  it('defaults invalid values and bounds oversized requests', () => {
    assert.equal(normalizeLogTailLines(undefined), 100);
    assert.equal(normalizeLogTailLines('-1'), 100);
    assert.equal(normalizeLogTailLines('1.5'), 100);
    assert.equal(normalizeLogTailLines('not-a-number'), 100);
    assert.equal(normalizeLogTailLines('100000'), 10_000);
  });
});
