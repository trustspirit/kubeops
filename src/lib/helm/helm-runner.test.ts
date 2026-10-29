import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { insertHelmFlags, isValidHelmName, parseRevision } from './helm-runner';

describe('insertHelmFlags', () => {
  it('puts flags before the -- separator so helm still reads them as flags', () => {
    assert.deepEqual(
      insertHelmFlags(['upgrade', '-n', 'ns', '--', 'rel', 'chart'], ['--timeout', '100s']),
      ['upgrade', '-n', 'ns', '--timeout', '100s', '--', 'rel', 'chart'],
    );
  });

  it('appends when there is no separator', () => {
    assert.deepEqual(insertHelmFlags(['list'], ['--all']), ['list', '--all']);
  });
});

describe('parseRevision', () => {
  it('accepts positive integers as numbers or digit strings', () => {
    assert.equal(parseRevision(3), 3);
    assert.equal(parseRevision('12'), 12);
  });

  it('rejects zero, negatives, fractions and flag-like strings', () => {
    for (const bad of [0, -1, 1.5, '0', '-1', '--force', '1; rm', '', null, undefined, {}]) {
      assert.equal(parseRevision(bad), null, String(bad));
    }
  });
});

describe('isValidHelmName', () => {
  it('rejects names that helm could read as flags', () => {
    assert.equal(isValidHelmName('--dry-run'), false);
    assert.equal(isValidHelmName('my-release'), true);
  });
});
