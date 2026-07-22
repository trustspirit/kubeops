import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConnectionAttemptGate } from './connection-attempt-gate';

describe('ConnectionAttemptGate', () => {
  it('deduplicates concurrent async connection attempts', async () => {
    const gate = new ConnectionAttemptGate();
    let releases!: () => void;
    const blocked = new Promise<void>(resolve => { releases = resolve; });
    let starts = 0;

    const first = gate.run(async () => {
      starts += 1;
      await blocked;
    });
    const second = gate.run(async () => {
      starts += 1;
    });

    assert.equal(first, second);
    assert.equal(starts, 1);
    releases();
    await first;
  });

  it('invalidates stale completions and permits a replacement attempt', async () => {
    const gate = new ConnectionAttemptGate();
    let staleIsCurrent!: () => boolean;
    let releaseStale!: () => void;
    const blocked = new Promise<void>(resolve => { releaseStale = resolve; });

    const stale = gate.run(async attempt => {
      staleIsCurrent = attempt.isCurrent;
      await blocked;
    });
    gate.invalidate();

    let replacementCurrent = false;
    await gate.run(async attempt => {
      replacementCurrent = attempt.isCurrent();
    });

    assert.equal(staleIsCurrent(), false);
    assert.equal(replacementCurrent, true);
    releaseStale();
    await stale;
  });
});
