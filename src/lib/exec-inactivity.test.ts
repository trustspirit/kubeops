import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getInactiveExecDeadline,
  isInactiveExecExpired,
  shouldReconnectInactiveExecOnActivation,
} from './exec-inactivity';

describe('exec inactivity policy', () => {
  it('starts and retains an inactivity deadline independently of socket state', () => {
    const deadline = getInactiveExecDeadline({
      active: false,
      now: 1_000,
      currentDeadline: null,
      timeoutMs: 300_000,
    });

    assert.equal(deadline, 301_000);
    assert.equal(getInactiveExecDeadline({
      active: false,
      now: 2_000,
      currentDeadline: deadline,
      timeoutMs: 300_000,
    }), deadline);
  });

  it('expires only while inactive and clears the deadline when active', () => {
    assert.equal(isInactiveExecExpired({ active: false, now: 301_000, deadline: 301_000 }), true);
    assert.equal(isInactiveExecExpired({ active: true, now: 301_000, deadline: 301_000 }), false);
    assert.equal(getInactiveExecDeadline({
      active: true,
      now: 301_000,
      currentDeadline: 301_000,
      timeoutMs: 300_000,
    }), null);
  });

  it('keeps a pre-deadline session but reconnects an expired session on activation', () => {
    assert.equal(shouldReconnectInactiveExecOnActivation({
      now: 300_999,
      inactiveDeadline: 301_000,
      idleClosed: false,
      normalExit: false,
    }), false);
    assert.equal(shouldReconnectInactiveExecOnActivation({
      now: 301_000,
      inactiveDeadline: 301_000,
      idleClosed: false,
      normalExit: false,
    }), true);
  });

  it('leaves a normally exited session disconnected after the inactive deadline', () => {
    assert.equal(shouldReconnectInactiveExecOnActivation({
      now: 301_000,
      inactiveDeadline: 301_000,
      idleClosed: false,
      normalExit: true,
    }), false);
  });
});
