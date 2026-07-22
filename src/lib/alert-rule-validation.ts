import type { ConditionOperator, ConditionType } from '@/types/alert';
import { isValidK8sQuantity, parseK8sQuantity } from './k8s-quantity';

export interface AlertRuleDraft {
  name: string;
  clusterId: string;
  conditionType: ConditionType;
  operator: ConditionOperator;
  value: string;
  cooldown: string;
}

export type AlertRuleValidationErrors = Partial<Record<
  'name' | 'clusterId' | 'operator' | 'value' | 'cooldown',
  string
>>;

export type AlertRuleValidationResult =
  | { ok: true; value: { conditionValue: string | number; cooldown: number } }
  | { ok: false; errors: AlertRuleValidationErrors };

export const CONDITION_OPERATORS: Record<ConditionType, ConditionOperator[]> = {
  status_change: ['==', 'contains'],
  restart_count: ['>', '<', '=='],
  cpu_threshold: ['>', '<', '=='],
  memory_threshold: ['>', '<', '=='],
  event_match: ['==', 'contains'],
};

export function validateAlertRuleDraft(draft: AlertRuleDraft): AlertRuleValidationResult {
  const errors: AlertRuleValidationErrors = {};
  const value = draft.value.trim();

  if (!draft.name.trim()) {
    errors.name = 'Name is required.';
  }
  if (!draft.clusterId.trim()) {
    errors.clusterId = 'Cluster ID is required.';
  }
  if (!CONDITION_OPERATORS[draft.conditionType].includes(draft.operator)) {
    errors.operator = 'This operator is not supported for the selected condition.';
  }

  let conditionValue: string | number = value;
  if (draft.conditionType === 'restart_count') {
    const restartCount = Number(value);
    if (!value || !Number.isFinite(restartCount) || !Number.isInteger(restartCount) || restartCount < 0) {
      errors.value = 'Restart count must be a non-negative integer.';
    } else {
      conditionValue = restartCount;
    }
  } else if (draft.conditionType === 'cpu_threshold' || draft.conditionType === 'memory_threshold') {
    const quantity = parseK8sQuantity(value);
    if (!isValidK8sQuantity(value) || !Number.isFinite(quantity) || quantity < 0) {
      errors.value = 'Enter a non-negative Kubernetes quantity.';
    }
  } else if (!value) {
    errors.value = 'Value is required.';
  }

  const cooldownValue = draft.cooldown.trim();
  const cooldown = Number(cooldownValue);
  if (!cooldownValue || !Number.isFinite(cooldown) || cooldown < 0) {
    errors.cooldown = 'Cooldown must be a non-negative number.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: { conditionValue, cooldown } };
}
