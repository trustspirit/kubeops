export type ConditionType = 'status_change' | 'restart_count' | 'cpu_threshold' | 'memory_threshold' | 'event_match';
export type ConditionOperator = '>' | '<' | '==' | 'contains';

export interface AlertCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: string | number;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  clusterId: string;
  namespace?: string;
  resourceType: string;
  condition: AlertCondition;
  cooldown: number;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  clusterId: string;
  namespace?: string;
  resourceType: string;
  resourceName: string;
  condition: AlertCondition;
  message: string;
  timestamp: number;
  read: boolean;
}
