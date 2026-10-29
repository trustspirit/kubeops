import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupByNamespace, toBulkTargets } from './bulk-selection';

describe('toBulkTargets', () => {
  it('drops unnamed rows and falls back for missing namespaces', () => {
    const targets = toBulkTargets([
      { metadata: { name: 'a', namespace: 'prod' } },
      { metadata: { namespace: 'prod' } },
      { metadata: { name: 'b' } },
    ], '_');
    assert.deepEqual(targets, [
      { name: 'a', namespace: 'prod' },
      { name: 'b', namespace: '_' },
    ]);
  });
});

describe('groupByNamespace', () => {
  it('groups and counts per namespace, sorted', () => {
    const groups = groupByNamespace([
      { name: 'web-2', namespace: 'prod' },
      { name: 'job', namespace: 'batch' },
      { name: 'web-1', namespace: 'prod' },
    ]);
    assert.deepEqual(groups, [
      { namespace: 'batch', names: ['job'] },
      { namespace: 'prod', names: ['web-1', 'web-2'] },
    ]);
  });
});
