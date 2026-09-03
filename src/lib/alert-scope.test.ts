import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAlertRuleActivity, selectRulesForCluster, summarizeAlertScope } from './alert-scope';
import type { AlertRule } from '@/types/alert';

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: overrides.id ?? 'r1',
    name: overrides.name ?? 'Restarts',
    enabled: overrides.enabled ?? true,
    clusterId: overrides.clusterId ?? 'prod',
    namespace: overrides.namespace,
    resourceType: overrides.resourceType ?? 'pods',
    condition: overrides.condition ?? { type: 'restart_count', operator: '>', value: 3 },
    cooldown: overrides.cooldown ?? 300,
  };
}

describe('getAlertRuleActivity', () => {
  it('is active for an enabled rule on the cluster being viewed', () => {
    assert.equal(getAlertRuleActivity(rule(), 'prod'), 'active');
  });

  it('still runs — in the background — for another cluster', () => {
    assert.equal(getAlertRuleActivity(rule(), 'staging'), 'background');
  });

  it('runs in the background when no cluster is open at all', () => {
    assert.equal(getAlertRuleActivity(rule(), null), 'background');
  });

  it('reports disabled ahead of everything else, so the switch is what the user sees', () => {
    assert.equal(getAlertRuleActivity(rule({ enabled: false }), 'prod'), 'disabled');
    assert.equal(getAlertRuleActivity(rule({ enabled: false }), 'staging'), 'disabled');
  });
});

describe('selectRulesForCluster', () => {
  it('keeps only enabled rules for the given cluster', () => {
    const rules = [
      rule({ id: 'a', clusterId: 'prod' }),
      rule({ id: 'b', clusterId: 'staging' }),
      rule({ id: 'c', clusterId: 'prod', enabled: false }),
    ];
    assert.deepEqual(selectRulesForCluster(rules, 'prod').map((r) => r.id), ['a']);
  });

  it('returns nothing without a cluster', () => {
    assert.deepEqual(selectRulesForCluster([rule()], null), []);
  });

  it('does not match a cluster whose name merely shares a prefix', () => {
    assert.deepEqual(selectRulesForCluster([rule({ clusterId: 'prod-eu' })], 'prod'), []);
  });
});

describe('summarizeAlertScope', () => {
  it('counts each rule exactly once', () => {
    const rules = [
      rule({ id: 'a', clusterId: 'prod' }),
      rule({ id: 'b', clusterId: 'staging' }),
      rule({ id: 'c', clusterId: 'dev', enabled: false }),
      rule({ id: 'd', clusterId: 'staging' }),
    ];
    const summary = summarizeAlertScope(rules, 'prod');
    assert.equal(summary.active, 1);
    assert.equal(summary.background, 2);
    assert.equal(summary.disabled, 1);
    assert.equal(summary.active + summary.background + summary.disabled, rules.length);
  });

  it('lists the background clusters once each, sorted', () => {
    const rules = [
      rule({ id: 'a', clusterId: 'staging' }),
      rule({ id: 'b', clusterId: 'staging' }),
      rule({ id: 'c', clusterId: 'dev' }),
    ];
    assert.deepEqual(summarizeAlertScope(rules, 'prod').backgroundClusters, ['dev', 'staging']);
  });

  it('does not list disabled rules as background clusters', () => {
    const rules = [rule({ clusterId: 'dev', enabled: false })];
    assert.deepEqual(summarizeAlertScope(rules, 'prod').backgroundClusters, []);
  });

  it('handles an empty rule set', () => {
    const summary = summarizeAlertScope([], 'prod');
    assert.deepEqual(summary, { active: 0, background: 0, disabled: 0, backgroundClusters: [] });
  });
});
