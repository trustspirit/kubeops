import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KubeEvent, KubeList, KubePod } from '@/types/resource';
import { summarizeClusterHealth } from './multi-cluster-health';

const list = <T>(items: T[]): KubeList<T> => ({ apiVersion: 'v1', kind: 'List', metadata: {}, items });
const ok = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
const fail = (message: string): PromiseRejectedResult => ({ status: 'rejected', reason: new Error(message) });
const cluster = { name: 'prod', status: 'connected' as const };

describe('summarizeClusterHealth', () => {
  it('marks the cluster as errored when pods could not be listed', () => {
    const health = summarizeClusterHealth(cluster, fail('forbidden'), ok(list<KubeEvent>([])));
    assert.equal(health.status, 'error');
    assert.equal(health.error, 'forbidden');
  });

  it('counts running and failing pods', () => {
    const pods = [
      { status: { phase: 'Running' } },
      { status: { phase: 'Pending', containerStatuses: [{ state: { waiting: { reason: 'CrashLoopBackOff' } } }] } },
    ] as unknown as KubePod[];
    const health = summarizeClusterHealth(cluster, ok(list(pods)), ok(list<KubeEvent>([])));
    assert.equal(health.status, 'connected');
    assert.equal(health.podCount, 2);
    assert.equal(health.runningPods, 1);
    assert.equal(health.failingPods, 1);
    assert.equal(health.error, undefined);
  });

  it('keeps pod numbers but notes when events are unavailable', () => {
    const health = summarizeClusterHealth(cluster, ok(list<KubePod>([])), fail('timeout'));
    assert.equal(health.status, 'connected');
    assert.equal(health.error, undefined);
    assert.match(health.warning ?? '', /timeout/);
  });

  it('counts only recent warning events', () => {
    const now = Date.parse('2024-01-01T12:00:00Z');
    const events = [
      { type: 'Warning', lastTimestamp: '2024-01-01T11:30:00Z' },
      { type: 'Warning', lastTimestamp: '2024-01-01T10:00:00Z' },
      { type: 'Normal', lastTimestamp: '2024-01-01T11:59:00Z' },
    ] as unknown as KubeEvent[];
    const health = summarizeClusterHealth(cluster, ok(list<KubePod>([])), ok(list(events)), now);
    assert.equal(health.warningEvents, 1);
  });
});
