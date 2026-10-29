import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateRules, getAlertCooldownKey } from './alert-evaluator';
import type { AlertRule } from '@/types/alert';
import type { WatchEvent } from '@/types/watch';

const rule: AlertRule = {
  id: 'restarts',
  name: 'Restarts',
  enabled: true,
  clusterId: 'prod',
  resourceType: 'pods',
  condition: { type: 'restart_count', operator: '>', value: 3 },
  cooldown: 300,
};

function podEvent(uid: string, name: string, restarts = 5): WatchEvent {
  return {
    type: 'MODIFIED',
    object: {
      kind: 'Pod',
      metadata: { uid, name, namespace: 'web' },
      status: { containerStatuses: [{ restartCount: restarts }] },
    },
  } as unknown as WatchEvent;
}

describe('evaluateRules cooldown', () => {
  it('cools down per resource, so one pod does not silence the rule for others', () => {
    const lastTriggered: Record<string, number> = {};
    const first = evaluateRules([rule], podEvent('a', 'api-0'), lastTriggered);
    assert.equal(first.length, 1);
    lastTriggered[getAlertCooldownKey(rule.id, podEvent('a', 'api-0').object)] = first[0].timestamp;

    assert.equal(evaluateRules([rule], podEvent('a', 'api-0'), lastTriggered).length, 0);
    assert.equal(evaluateRules([rule], podEvent('b', 'api-1'), lastTriggered).length, 1);
  });

  it('falls back to kind/namespace/name when a resource has no uid', () => {
    const key = getAlertCooldownKey('r', { kind: 'Pod', metadata: { name: 'x', namespace: 'ns' } } as unknown as WatchEvent['object']);
    assert.equal(key, 'r:Pod/ns/x');
  });
});
