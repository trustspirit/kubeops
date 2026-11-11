import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KubeResource } from '@/types/resource';
import {
  getQuickFilters,
  isPodPending,
  isPodUnhealthy,
  podRestartCount,
  replicaReadiness,
} from './resource-quick-filters';

function pod(phase: string, statuses: Array<{ ready: boolean; restartCount?: number }> = [], extra: Record<string, unknown> = {}): KubeResource {
  return { metadata: { name: 'p', ...extra }, status: { phase, containerStatuses: statuses } } as KubeResource;
}

describe('pod quick filters', () => {
  it('flags failed, stuck and partly-ready pods as unhealthy', () => {
    assert.equal(isPodUnhealthy(pod('Running', [{ ready: true }])), false);
    assert.equal(isPodUnhealthy(pod('Succeeded', [{ ready: false }])), false);
    assert.equal(isPodUnhealthy(pod('Running', [{ ready: true }, { ready: false }])), true);
    assert.equal(isPodUnhealthy(pod('Pending')), true);
    assert.equal(isPodUnhealthy(pod('Failed')), true);
    assert.equal(isPodUnhealthy({ metadata: { name: 'p' } } as KubeResource), true);
  });

  it('does not count a terminating pod as unhealthy or pending', () => {
    const terminating = pod('Pending', [], { deletionTimestamp: '2026-01-01T00:00:00Z' });
    assert.equal(isPodUnhealthy(terminating), false);
    assert.equal(isPodPending(terminating), false);
    assert.equal(isPodPending(pod('Pending')), true);
  });

  it('sums restarts across containers', () => {
    assert.equal(podRestartCount(pod('Running', [{ ready: true, restartCount: 2 }, { ready: true, restartCount: 3 }])), 5);
    assert.equal(podRestartCount(pod('Running')), 0);
  });
});

describe('workload quick filters', () => {
  it('compares ready and desired replicas', () => {
    const dep = { metadata: { name: 'd' }, spec: { replicas: 3 }, status: { readyReplicas: 1 } } as KubeResource;
    assert.deepEqual(replicaReadiness(dep), { ready: 1, desired: 3 });
    const [notReady] = getQuickFilters('deployments');
    assert.equal(notReady.matches(dep), true);
    assert.equal(notReady.matches({ metadata: { name: 'd' }, spec: { replicas: 0 }, status: {} } as KubeResource), false);
  });

  it('offers filters only where they make sense', () => {
    assert.deepEqual(getQuickFilters('pods').map((f) => f.id), ['unhealthy', 'pending', 'restarts']);
    assert.deepEqual(getQuickFilters('daemonsets').map((f) => f.id), ['not-ready']);
    assert.deepEqual(getQuickFilters('configmaps'), []);
  });
});
