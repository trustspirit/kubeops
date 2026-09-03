import type { AlertRule } from '@/types/alert';

/**
 * Alert rules are evaluated for every cluster they target, whether or not that
 * cluster is on screen: the cluster you are viewing is handled by the in-page
 * monitor, and the rest by background Watch connections.
 *
 * `monitored` distinguishes the two only so the settings screen can show where
 * the events are coming from — both states fire alerts.
 */
export type AlertRuleActivity = 'active' | 'background' | 'disabled';

export function getAlertRuleActivity(
  rule: Pick<AlertRule, 'enabled' | 'clusterId'>,
  activeClusterId: string | null,
): AlertRuleActivity {
  if (!rule.enabled) return 'disabled';
  return rule.clusterId === activeClusterId ? 'active' : 'background';
}

/** Rules evaluated against the given cluster's Watch stream. */
export function selectRulesForCluster(rules: AlertRule[], clusterId: string | null): AlertRule[] {
  if (!clusterId) return [];
  return rules.filter((rule) => rule.enabled && rule.clusterId === clusterId);
}

export interface AlertScopeSummary {
  active: number;
  background: number;
  disabled: number;
  /** Clusters monitored in the background, i.e. everything but the open one. */
  backgroundClusters: string[];
}

/** Counts for the settings screen, so the scope is visible at a glance. */
export function summarizeAlertScope(
  rules: AlertRule[],
  activeClusterId: string | null,
): AlertScopeSummary {
  const summary: AlertScopeSummary = {
    active: 0,
    background: 0,
    disabled: 0,
    backgroundClusters: [],
  };
  const clusters = new Set<string>();

  for (const rule of rules) {
    const activity = getAlertRuleActivity(rule, activeClusterId);
    summary[activity] += 1;
    if (activity === 'background' && rule.clusterId) clusters.add(rule.clusterId);
  }

  summary.backgroundClusters = [...clusters].sort();
  return summary;
}
