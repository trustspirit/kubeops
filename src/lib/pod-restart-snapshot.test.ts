import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluatePodRestart } from './pod-restart-snapshot';

describe('evaluatePodRestart', () => {
  it('creates a baseline without notifying on first observation', () => {
    assert.deepEqual(evaluatePodRestart(undefined, 'uid-a', 2), {
      next: { uid: 'uid-a', restartCount: 2 },
      delta: 0,
      changed: true,
    });
  });

  it('reports an increase for the same Pod UID', () => {
    assert.deepEqual(
      evaluatePodRestart({ uid: 'uid-a', restartCount: 2 }, 'uid-a', 4),
      {
        next: { uid: 'uid-a', restartCount: 4 },
        delta: 2,
        changed: true,
      },
    );
  });

  it('resets the baseline when a same-name Pod has a new UID', () => {
    assert.deepEqual(
      evaluatePodRestart({ uid: 'uid-a', restartCount: 5 }, 'uid-b', 0),
      {
        next: { uid: 'uid-b', restartCount: 0 },
        delta: 0,
        changed: true,
      },
    );
  });

  it('resets the baseline when the restart counter rolls back', () => {
    assert.deepEqual(
      evaluatePodRestart({ uid: 'uid-a', restartCount: 5 }, 'uid-a', 1),
      {
        next: { uid: 'uid-a', restartCount: 1 },
        delta: 0,
        changed: true,
      },
    );
  });

  it('does not update an unchanged snapshot', () => {
    assert.deepEqual(
      evaluatePodRestart({ uid: 'uid-a', restartCount: 2 }, 'uid-a', 2),
      {
        next: { uid: 'uid-a', restartCount: 2 },
        delta: 0,
        changed: false,
      },
    );
  });

  it('migrates a legacy numeric snapshot without a false notification', () => {
    assert.deepEqual(evaluatePodRestart(7, 'uid-a', 8), {
      next: { uid: 'uid-a', restartCount: 8 },
      delta: 0,
      changed: true,
    });
  });
});
