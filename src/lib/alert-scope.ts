import type { AlertRule } from '@/types/alert';

/**
 * Alert rules are evaluated from the Watch stream of the cluster you are
 * currently viewing, reusing that page's existing connection. A rule targeting
 * a different cluster is therefore *paused*, not broken.
 *
 * This used to be an unstated limitation — rules simply stopped firing the
 * moment you navigated away, with nothing in the UI to explain it. The state is
 * now derived explicitly so the settings screen can show it.
 */
export type AlertRuleActivity = 'active' | 'paused' | 'disabled';

export function getAlertRuleActivity(
  rule: Pick<AlertRule, 'enabled' | 'clusterId'>,
  activeClusterId: string | null,
): AlertRuleActivity {
  if (!rule.enabled) return 'disabled';
  if (!activeClusterId || rule.clusterId !== activeClusterId) return 'paused';
  return 'active';
}

/** Rules that should be evaluated against the given cluster's Watch stream. */
export function selectActiveRules(
  rules: AlertRule[],
  activeClusterId: string | null,
): AlertRule[] {
  if (!activeClusterId) return [];
  return rules.filter((rule) => getAlertRuleActivity(rule, activeClusterId) === 'active');
}

export interface AlertScopeSummary {
  active: number;
  paused: number;
  disabled: number;
  /** Clusters that have enabled rules but are not the one being viewed. */
  pausedClusters: string[];
}

/** Counts for the settings screen, so the scope is visible at a glance. */
export function summarizeAlertScope(
  rules: AlertRule[],
  activeClusterId: string | null,
): AlertScopeSummary {
  const summary: AlertScopeSummary = { active: 0, paused: 0, disabled: 0, pausedClusters: [] };
  const pausedClusters = new Set<string>();

  for (const rule of rules) {
    const activity = getAlertRuleActivity(rule, activeClusterId);
    summary[activity] += 1;
    if (activity === 'paused' && rule.clusterId) pausedClusters.add(rule.clusterId);
  }

  summary.pausedClusters = [...pausedClusters].sort();
  return summary;
}
