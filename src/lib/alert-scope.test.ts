import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAlertRuleActivity, selectActiveRules, summarizeAlertScope } from './alert-scope';
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

  it('is paused for an enabled rule on another cluster', () => {
    assert.equal(getAlertRuleActivity(rule(), 'staging'), 'paused');
  });

  it('is paused when no cluster is open', () => {
    assert.equal(getAlertRuleActivity(rule(), null), 'paused');
  });

  it('reports disabled ahead of paused, so the switch is what the user sees', () => {
    assert.equal(getAlertRuleActivity(rule({ enabled: false }), 'prod'), 'disabled');
    assert.equal(getAlertRuleActivity(rule({ enabled: false }), 'staging'), 'disabled');
  });
});

describe('selectActiveRules', () => {
  it('keeps only enabled rules for the open cluster', () => {
    const rules = [
      rule({ id: 'a', clusterId: 'prod' }),
      rule({ id: 'b', clusterId: 'staging' }),
      rule({ id: 'c', clusterId: 'prod', enabled: false }),
    ];
    assert.deepEqual(selectActiveRules(rules, 'prod').map((r) => r.id), ['a']);
  });

  it('returns nothing when no cluster is open', () => {
    assert.deepEqual(selectActiveRules([rule()], null), []);
  });

  it('does not match a cluster whose name merely shares a prefix', () => {
    assert.deepEqual(selectActiveRules([rule({ clusterId: 'prod-eu' })], 'prod'), []);
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
    assert.equal(summary.paused, 2);
    assert.equal(summary.disabled, 1);
    assert.equal(summary.active + summary.paused + summary.disabled, rules.length);
  });

  it('lists the paused clusters once each, sorted', () => {
    const rules = [
      rule({ id: 'a', clusterId: 'staging' }),
      rule({ id: 'b', clusterId: 'staging' }),
      rule({ id: 'c', clusterId: 'dev' }),
    ];
    assert.deepEqual(summarizeAlertScope(rules, 'prod').pausedClusters, ['dev', 'staging']);
  });

  it('does not list disabled rules as paused clusters', () => {
    const rules = [rule({ clusterId: 'dev', enabled: false })];
    assert.deepEqual(summarizeAlertScope(rules, 'prod').pausedClusters, []);
  });

  it('handles an empty rule set', () => {
    const summary = summarizeAlertScope([], 'prod');
    assert.deepEqual(summary, { active: 0, paused: 0, disabled: 0, pausedClusters: [] });
  });
});
