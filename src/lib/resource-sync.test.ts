import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyResourceWatchEvent,
  getKubeResourceRowId,
  normalizeWatchNamespace,
  shouldRevalidateAfterWatchTransition,
} from './resource-sync';
import type { KubeList, KubeResource } from '@/types/resource';

function resource(uid: string, name = uid): KubeResource {
  return { metadata: { uid, name, namespace: 'default' } };
}

function list(items: KubeResource[]): KubeList {
  return {
    apiVersion: 'v1',
    kind: 'List',
    metadata: { resourceVersion: '10' },
    items,
  };
}

describe('normalizeWatchNamespace', () => {
  it('maps the REST all-namespaces sentinel to an all-namespaces Watch', () => {
    assert.equal(normalizeWatchNamespace('_all'), undefined);
  });

  it('keeps a real namespace unchanged', () => {
    assert.equal(normalizeWatchNamespace('default'), 'default');
  });
});

describe('applyResourceWatchEvent', () => {
  it('adds a resource that is not in the cached list', () => {
    const previous = list([resource('a')]);
    const next = applyResourceWatchEvent(previous, {
      type: 'ADDED',
      object: resource('b'),
    });

    assert.deepEqual(next?.items.map((item) => item.metadata.uid), ['a', 'b']);
  });

  it('replaces a modified resource by UID', () => {
    const previous = list([resource('a', 'old')]);
    const next = applyResourceWatchEvent(previous, {
      type: 'MODIFIED',
      object: resource('a', 'new'),
    });

    assert.equal(next?.items[0].metadata.name, 'new');
  });

  it('removes a deleted resource by UID', () => {
    const previous = list([resource('a'), resource('b')]);
    const next = applyResourceWatchEvent(previous, {
      type: 'DELETED',
      object: resource('a'),
    });

    assert.deepEqual(next?.items.map((item) => item.metadata.uid), ['b']);
  });

  it('preserves the cache for Watch errors', () => {
    const previous = list([resource('a')]);
    const next = applyResourceWatchEvent(previous, {
      type: 'ERROR',
      object: { message: 'stream failed' },
    });

    assert.equal(next, previous);
  });
});

describe('shouldRevalidateAfterWatchTransition', () => {
  it('revalidates when a previously live Watch recovers', () => {
    assert.equal(shouldRevalidateAfterWatchTransition('disconnected', 'connected', true), true);
    assert.equal(shouldRevalidateAfterWatchTransition('reconnecting', 'connected', true), true);
  });

  it('does not revalidate for the initial connection or stable states', () => {
    assert.equal(shouldRevalidateAfterWatchTransition('connecting', 'connected', false), false);
    assert.equal(shouldRevalidateAfterWatchTransition('connected', 'connected', true), false);
    assert.equal(shouldRevalidateAfterWatchTransition('connected', 'disconnected', true), false);
  });
});

describe('getKubeResourceRowId', () => {
  it('uses Kubernetes UID so identity survives array reordering', () => {
    const pod = resource('pod-uid', 'pod');
    assert.equal(getKubeResourceRowId(pod, 0), 'pod-uid');
    assert.equal(getKubeResourceRowId(pod, 7), 'pod-uid');
  });

  it('falls back to namespace/name and finally the row index', () => {
    assert.equal(
      getKubeResourceRowId({ metadata: { name: 'pod', namespace: 'ns' } }, 3),
      'ns/pod',
    );
    assert.equal(
      getKubeResourceRowId({ metadata: { name: '' } }, 3),
      'resource-row-3',
    );
  });
});
