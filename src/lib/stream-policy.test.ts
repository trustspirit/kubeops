import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canRetryStream, getReconnectDelay, isNearScrollBottom } from './stream-policy';

describe('stream policy', () => {
  it('uses bounded exponential reconnect delays', () => {
    assert.equal(getReconnectDelay(0, 0.5), 500);
    assert.equal(getReconnectDelay(1, 0.5), 1000);
    assert.equal(getReconnectDelay(10, 0.5), 10000);
  });

  it('does not retry intentional close, normal exec exit, or exhausted attempts', () => {
    assert.equal(canRetryStream({ intentional: true, normalExit: false, attempt: 0, maxAttempts: 5 }), false);
    assert.equal(canRetryStream({ intentional: false, normalExit: true, attempt: 0, maxAttempts: 5 }), false);
    assert.equal(canRetryStream({ intentional: false, normalExit: false, attempt: 5, maxAttempts: 5 }), false);
    assert.equal(canRetryStream({ intentional: false, normalExit: false, attempt: 2, maxAttempts: 5 }), true);
  });

  it('treats a viewport within 24 pixels of the bottom as following', () => {
    assert.equal(isNearScrollBottom({ scrollTop: 776, clientHeight: 200, scrollHeight: 1000 }), true);
    assert.equal(isNearScrollBottom({ scrollTop: 700, clientHeight: 200, scrollHeight: 1000 }), false);
  });
});
