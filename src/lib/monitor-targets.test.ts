import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALERT_RESOURCE_TYPES,
  getActiveTarget,
  getBackgroundTargets,
  getMonitorTargets,
  POD_ONLY_RESOURCE_TYPES,
} from './monitor-targets';
import type { AlertRule } from '@/types/alert';
import type { WatchedPod } from '@/stores/pod-watcher-store';

function rule(clusterId: string, enabled = true): AlertRule {
  return {
    id: `${clusterId}-rule`,
    name: 'Restarts',
    enabled,
    clusterId,
    resourceType: 'pods',
    condition: { type: 'restart_count', operator: '>', value: 3 },
    cooldown: 300,
  };
}

function watched(clusterId: string, name = 'api-0'): WatchedPod {
  return { clusterId, namespace: 'default', name };
}

describe('getMonitorTargets', () => {
  it('returns nothing when nothing is being monitored', () => {
    assert.deepEqual(getMonitorTargets([], []), []);
  });

  it('subscribes to pods only for a cluster that just has watched pods', () => {
    const [target] = getMonitorTargets([], [watched('prod')]);
    assert.equal(target.clusterId, 'prod');
    assert.deepEqual(target.resourceTypes, POD_ONLY_RESOURCE_TYPES);
    assert.equal(target.hasWatchedPods, true);
    assert.equal(target.hasRules, false);
  });

  it('widens the subscription set only when a rule needs it', () => {
    const [target] = getMonitorTargets([rule('prod')], []);
    assert.deepEqual(target.resourceTypes, ALERT_RESOURCE_TYPES);
  });

  it('merges rules and watched pods for the same cluster into one target', () => {
    const targets = getMonitorTargets([rule('prod')], [watched('prod')]);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].hasRules, true);
    assert.equal(targets[0].hasWatchedPods, true);
  });

  it('ignores disabled rules', () => {
    assert.deepEqual(getMonitorTargets([rule('prod', false)], []), []);
  });

  it('still monitors a cluster whose only enabled rule is disabled but has a watched pod', () => {
    const [target] = getMonitorTargets([rule('prod', false)], [watched('prod')]);
    assert.deepEqual(target.resourceTypes, POD_ONLY_RESOURCE_TYPES);
  });

  it('returns one target per cluster, sorted', () => {
    const targets = getMonitorTargets(
      [rule('staging'), rule('dev')],
      [watched('staging'), watched('staging', 'api-1')],
    );
    assert.deepEqual(targets.map((t) => t.clusterId), ['dev', 'staging']);
  });
});

describe('getBackgroundTargets', () => {
  it('excludes the open cluster, which reuses its page connection', () => {
    const targets = getMonitorTargets([rule('prod'), rule('staging')], []);
    assert.deepEqual(
      getBackgroundTargets(targets, 'prod').map((t) => t.clusterId),
      ['staging'],
    );
  });

  it('keeps every target when no cluster is open', () => {
    const targets = getMonitorTargets([rule('prod'), rule('staging')], []);
    assert.equal(getBackgroundTargets(targets, null).length, 2);
  });
});

describe('getActiveTarget', () => {
  it('finds the open cluster when it needs monitoring', () => {
    const targets = getMonitorTargets([rule('prod')], []);
    assert.equal(getActiveTarget(targets, 'prod')?.clusterId, 'prod');
  });

  it('returns undefined when the open cluster has nothing to monitor', () => {
    const targets = getMonitorTargets([rule('staging')], []);
    assert.equal(getActiveTarget(targets, 'prod'), undefined);
  });

  it('returns undefined when no cluster is open', () => {
    const targets = getMonitorTargets([rule('prod')], []);
    assert.equal(getActiveTarget(targets, null), undefined);
  });

  it('together with getBackgroundTargets covers every target exactly once', () => {
    const targets = getMonitorTargets([rule('prod'), rule('staging'), rule('dev')], []);
    const background = getBackgroundTargets(targets, 'prod');
    const active = getActiveTarget(targets, 'prod');
    assert.equal(background.length + (active ? 1 : 0), targets.length);
    assert.equal(background.some((t) => t.clusterId === 'prod'), false);
  });
});
