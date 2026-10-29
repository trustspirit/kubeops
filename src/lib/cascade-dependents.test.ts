import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessDependents } from './cascade-dependents';

describe('assessDependents', () => {
  it('is known for a complete scan', () => {
    assert.deepEqual(assessDependents({ incomplete: false, failed: [] }, null), { unknown: false, reasons: [] });
    assert.equal(assessDependents({}, null).unknown, false);
  });

  it('is unknown when the fetch failed', () => {
    const result = assessDependents(null, 'timeout');
    assert.equal(result.unknown, true);
    assert.match(result.reasons[0], /timeout/);
  });

  it('is unknown for an incomplete scan or failed lookups', () => {
    assert.equal(assessDependents({ incomplete: true }, null).unknown, true);
    const failed = assessDependents({ incomplete: true, failed: ['Pod', 'ReplicaSet'] }, null);
    assert.equal(failed.unknown, true);
    assert.deepEqual(failed.reasons, ['Could not check: Pod, ReplicaSet']);
  });
});
