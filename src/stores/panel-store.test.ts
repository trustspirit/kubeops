import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPanelTabId } from './panel-store';

describe('buildPanelTabId', () => {
  it('distinguishes identically named pods in different clusters', () => {
    const prod = buildPanelTabId({
      type: 'logs', clusterId: 'prod', namespace: 'web', podName: 'api-0', container: 'app',
    });
    const staging = buildPanelTabId({
      type: 'logs', clusterId: 'staging', namespace: 'web', podName: 'api-0', container: 'app',
    });
    assert.notEqual(prod, staging);
  });

  it('distinguishes identically named pods in different namespaces', () => {
    const a = buildPanelTabId({
      type: 'logs', clusterId: 'prod', namespace: 'web', podName: 'api-0', container: 'app',
    });
    const b = buildPanelTabId({
      type: 'logs', clusterId: 'prod', namespace: 'batch', podName: 'api-0', container: 'app',
    });
    assert.notEqual(a, b);
  });

  it('distinguishes logs from exec for the same target', () => {
    const target = { clusterId: 'prod', namespace: 'web', podName: 'api-0', container: 'app' };
    assert.notEqual(
      buildPanelTabId({ ...target, type: 'logs' }),
      buildPanelTabId({ ...target, type: 'exec' }),
    );
  });

  it('is stable for the same target', () => {
    const target = {
      type: 'exec', clusterId: 'prod', namespace: 'web', podName: 'api-0', container: 'app',
    } as const;
    assert.equal(buildPanelTabId(target), buildPanelTabId({ ...target }));
  });

  it('does not collide when a separator appears inside a segment', () => {
    const a = buildPanelTabId({
      type: 'logs', clusterId: 'a|b', namespace: 'c', podName: 'p', container: 'x',
    });
    const b = buildPanelTabId({
      type: 'logs', clusterId: 'a', namespace: 'b|c', podName: 'p', container: 'x',
    });
    assert.notEqual(a, b);
  });
});
