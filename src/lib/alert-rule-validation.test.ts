import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONDITION_OPERATORS, validateAlertRuleDraft } from './alert-rule-validation';

const base = {
  name: 'High CPU',
  clusterId: 'dev',
  conditionType: 'cpu_threshold' as const,
  operator: '>' as const,
  value: '100m',
  cooldown: '0',
};

describe('alert rule validation', () => {
  it('preserves Kubernetes quantities and cooldown zero', () => {
    const result = validateAlertRuleDraft(base);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.conditionValue, '100m');
    assert.equal(result.value.cooldown, 0);
  });

  it('rejects NaN, negative counts, invalid quantities, and unsupported operators', () => {
    assert.equal(validateAlertRuleDraft({ ...base, conditionType: 'restart_count', value: 'abc' }).ok, false);
    assert.equal(validateAlertRuleDraft({ ...base, conditionType: 'restart_count', value: '-1' }).ok, false);
    assert.equal(validateAlertRuleDraft({ ...base, value: '100watts' }).ok, false);
    assert.equal(validateAlertRuleDraft({ ...base, operator: 'contains' }).ok, false);
    assert.deepEqual(CONDITION_OPERATORS.status_change, ['==', 'contains']);
  });

  it('rejects CPU and memory quantities that overflow to infinity', () => {
    assert.equal(validateAlertRuleDraft({ ...base, value: '1e999' }).ok, false);
    assert.equal(
      validateAlertRuleDraft({ ...base, conditionType: 'memory_threshold', value: '1e999' }).ok,
      false,
    );
  });
});
