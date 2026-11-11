import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KubeResource } from '@/types/resource';
import { selectEventsFor } from './resource-events';

function event(overrides: Record<string, unknown>): KubeResource {
  return { metadata: { name: 'e', uid: String(Math.random()) }, ...overrides } as KubeResource;
}

describe('selectEventsFor', () => {
  const events = [
    event({ involvedObject: { kind: 'Pod', name: 'api', uid: 'u1' }, type: 'Warning', reason: 'BackOff', message: 'Back-off restarting', count: 12, lastTimestamp: '2026-01-01T10:00:00Z' }),
    event({ involvedObject: { kind: 'Pod', name: 'api', uid: 'u1' }, reason: 'Pulled', message: 'pulled image', lastTimestamp: '2026-01-01T11:00:00Z' }),
    event({ involvedObject: { kind: 'Pod', name: 'api', uid: 'old' }, reason: 'Killing', lastTimestamp: '2026-01-01T09:00:00Z' }),
    event({ involvedObject: { kind: 'Pod', name: 'worker', uid: 'u2' }, reason: 'Scheduled' }),
    event({ involvedObject: { kind: 'Deployment', name: 'api' }, reason: 'ScalingReplicaSet' }),
  ];

  it('keeps only events about the target, newest first', () => {
    const rows = selectEventsFor(events, { kind: 'Pod', name: 'api', uid: 'u1' });
    assert.deepEqual(rows.map((r) => r.reason), ['Pulled', 'BackOff']);
    assert.equal(rows[1].type, 'Warning');
    assert.equal(rows[1].count, 12);
    assert.equal(rows[0].type, 'Normal');
  });

  it('excludes a previous incarnation with the same name when the uid is known', () => {
    assert.equal(selectEventsFor(events, { kind: 'Pod', name: 'api', uid: 'u1' }).some((r) => r.reason === 'Killing'), false);
    assert.equal(selectEventsFor(events, { kind: 'Pod', name: 'api' }).some((r) => r.reason === 'Killing'), true);
  });

  it('matches by kind as well as name, and reads events.k8s.io fields', () => {
    assert.deepEqual(selectEventsFor(events, { kind: 'Deployment', name: 'api' }).map((r) => r.reason), ['ScalingReplicaSet']);
    const modern = [event({ regarding: { kind: 'Pod', name: 'api' }, reason: 'Unhealthy', note: 'probe failed', series: { count: 4, lastObservedTime: '2026-02-01T00:00:00Z' } })];
    const [row] = selectEventsFor(modern, { kind: 'Pod', name: 'api' });
    assert.equal(row.message, 'probe failed');
    assert.equal(row.count, 4);
    assert.equal(row.timestamp, '2026-02-01T00:00:00Z');
  });
});
