import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KubeList } from '@/types/resource';
import { canUseWatchConnection, mergeNamespaceLists, normalizeNamespaceSelection } from './resource-list-policy';

const list = (...names: string[]): KubeList => ({
  apiVersion: 'v1',
  kind: 'PodList',
  metadata: { resourceVersion: '1' },
  items: names.map((name) => ({ metadata: { name, uid: name } })) as KubeList['items'],
});

describe('mergeNamespaceLists', () => {
  it('concatenates the items of every namespace', () => {
    const merged = mergeNamespaceLists([
      { status: 'fulfilled', value: list('a') },
      { status: 'fulfilled', value: list('b', 'c') },
    ]);
    assert.deepEqual(merged.items.map((i) => i.metadata?.name), ['a', 'b', 'c']);
    assert.equal(merged.kind, 'PodList');
  });

  it('keeps the namespaces that succeeded when one is forbidden', () => {
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 });
    const merged = mergeNamespaceLists([
      { status: 'rejected', reason: forbidden },
      { status: 'fulfilled', value: list('b') },
    ]);
    assert.deepEqual(merged.items.map((i) => i.metadata?.name), ['b']);
  });

  it('throws the first error when every namespace failed', () => {
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 });
    assert.throws(
      () => mergeNamespaceLists([{ status: 'rejected', reason: forbidden }]),
      (err) => err === forbidden,
    );
  });
});

describe('normalizeNamespaceSelection', () => {
  it('sorts and de-duplicates so the cache key is stable', () => {
    assert.deepEqual(normalizeNamespaceSelection(['b', 'a', 'b', '']), ['a', 'b']);
    assert.deepEqual(normalizeNamespaceSelection(undefined), []);
  });
});

describe('canUseWatchConnection', () => {
  it('only allows the watch connection of the same cluster', () => {
    assert.equal(canUseWatchConnection('prod', 'prod'), true);
    assert.equal(canUseWatchConnection('prod', 'staging'), false);
    assert.equal(canUseWatchConnection(null, 'prod'), false);
    assert.equal(canUseWatchConnection('prod', null), false);
  });
});
