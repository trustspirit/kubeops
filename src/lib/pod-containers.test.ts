import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listPodContainers } from './pod-containers';
import type { KubeResource } from '@/types/resource';

const pod = (spec: unknown) => ({ spec } as KubeResource);

describe('listPodContainers', () => {
  it('lists regular containers before init containers', () => {
    const result = listPodContainers(pod({
      containers: [{ name: 'app' }, { name: 'sidecar' }],
      initContainers: [{ name: 'migrate' }],
    }));
    assert.deepEqual(result, [
      { name: 'app', init: false },
      { name: 'sidecar', init: false },
      { name: 'migrate', init: true },
    ]);
  });

  it('returns an empty list when the spec is missing rather than throwing', () => {
    assert.deepEqual(listPodContainers(undefined), []);
    assert.deepEqual(listPodContainers(pod(undefined)), []);
    assert.deepEqual(listPodContainers(pod({})), []);
  });

  it('surfaces init-only pods so the caller can still open logs', () => {
    const result = listPodContainers(pod({ initContainers: [{ name: 'setup' }] }));
    assert.deepEqual(result, [{ name: 'setup', init: true }]);
  });

  it('skips malformed entries', () => {
    const result = listPodContainers(pod({ containers: [{ name: '' }, {}, { name: 'ok' }] }));
    assert.deepEqual(result, [{ name: 'ok', init: false }]);
  });

  it('deduplicates a container listed in both lists', () => {
    const result = listPodContainers(pod({
      containers: [{ name: 'app' }],
      initContainers: [{ name: 'app' }],
    }));
    assert.deepEqual(result, [{ name: 'app', init: false }]);
  });
});
