import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allSucceeded,
  failedTargets,
  mergeRetriedRows,
  reconcileResults,
  snapshotKey,
  summarizeRows,
  type ApplyTarget,
} from './multi-cluster-apply';

const a: ApplyTarget = { clusterId: 'a', namespace: 'ns' };
const b: ApplyTarget = { clusterId: 'b', namespace: 'ns' };

describe('reconcileResults', () => {
  it('matches results by resource key regardless of order', () => {
    const rows = reconcileResults([a, b], ['ConfigMap/x', 'Secret/y'], [
      { ...b, status: 'success', resource: 'Secret/y' },
      { ...a, status: 'error', message: 'denied', resource: 'Secret/y' },
      { ...b, status: 'success', resource: 'ConfigMap/x' },
      { ...a, status: 'success', resource: 'ConfigMap/x' },
    ]);
    assert.deepEqual(rows.map((r) => [r.clusterId, r.resource, r.status]), [
      ['a', 'ConfigMap/x', 'success'],
      ['a', 'Secret/y', 'error'],
      ['b', 'ConfigMap/x', 'success'],
      ['b', 'Secret/y', 'success'],
    ]);
  });

  it('falls back to manifest order when the API omits resource', () => {
    const rows = reconcileResults([a], ['ConfigMap/x'], [{ ...a, status: 'success' }]);
    assert.deepEqual(rows, [{ ...a, resource: 'ConfigMap/x', status: 'success', message: undefined }]);
  });

  it('keeps the timed-out flag so the UI can say the outcome is unknown', () => {
    const rows = reconcileResults([a], ['ConfigMap/x'], [
      { ...a, status: 'error', message: 'timed out', resource: 'ConfigMap/x', timedOut: true },
    ]);
    assert.equal(rows[0].timedOut, true);
  });

  it('reports a missing result as an error instead of shrinking the total', () => {
    const rows = reconcileResults([a, b], ['ConfigMap/x'], [{ ...a, status: 'success', resource: 'ConfigMap/x' }]);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].status, 'error');
    assert.equal(allSucceeded(rows, [a, b], ['ConfigMap/x']), false);
  });

  it('ignores results for targets that are no longer selected', () => {
    const rows = reconcileResults([a], ['ConfigMap/x'], [
      { ...a, status: 'success', resource: 'ConfigMap/x' },
      { ...b, status: 'error', resource: 'ConfigMap/x' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(allSucceeded(rows, [a], ['ConfigMap/x']), true);
  });

  it('fails every document of a target whose preflight failed', () => {
    const rows = reconcileResults([a, b], ['ConfigMap/x', 'Secret/y'], [
      { ...b, status: 'success', resource: 'ConfigMap/x' },
      { ...b, status: 'success', resource: 'Secret/y' },
    ], [{ ...a, status: 'error', message: 'tsh login failed' }]);
    assert.deepEqual(rows.filter((r) => r.clusterId === 'a').map((r) => r.message), ['tsh login failed', 'tsh login failed']);
    assert.deepEqual(failedTargets(rows, [a, b]), [a]);
  });
});

describe('retry helpers', () => {
  it('replaces only the retried rows', () => {
    const first = reconcileResults([a, b], ['ConfigMap/x'], [
      { ...a, status: 'success', resource: 'ConfigMap/x' },
      { ...b, status: 'error', resource: 'ConfigMap/x' },
    ]);
    const retry = reconcileResults([b], ['ConfigMap/x'], [{ ...b, status: 'success', resource: 'ConfigMap/x' }]);
    const merged = mergeRetriedRows(first, retry);
    assert.deepEqual(summarizeRows(merged), { succeeded: 2, failed: 0, total: 2 });
    assert.deepEqual(failedTargets(merged, [a, b]), []);
  });
});

describe('snapshotKey', () => {
  it('changes with the YAML or the targets but not with target order', () => {
    assert.equal(snapshotKey([a, b], 'x'), snapshotKey([b, a], 'x'));
    assert.notEqual(snapshotKey([a], 'x'), snapshotKey([a, b], 'x'));
    assert.notEqual(snapshotKey([a], 'x'), snapshotKey([a], 'y'));
  });
});
