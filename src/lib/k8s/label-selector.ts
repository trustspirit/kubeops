/**
 * Pure evaluation of a Kubernetes LabelSelector (matchLabels + matchExpressions).
 *
 * Kept free of client-node runtime imports so it can be unit-tested and shared
 * by routes and the UI.
 */

export interface LabelSelectorRequirement {
  key: string;
  operator: string;
  values?: string[];
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: LabelSelectorRequirement[];
}

export function isEmptySelector(selector: LabelSelector | undefined | null): boolean {
  if (!selector) return true;
  const hasLabels = !!selector.matchLabels && Object.keys(selector.matchLabels).length > 0;
  const hasExpressions = !!selector.matchExpressions && selector.matchExpressions.length > 0;
  return !hasLabels && !hasExpressions;
}

function requirementMatches(req: LabelSelectorRequirement, labels: Record<string, string>): boolean {
  const has = Object.prototype.hasOwnProperty.call(labels, req.key);
  const values = req.values || [];
  switch (req.operator) {
    case 'In':
      return has && values.includes(labels[req.key]);
    case 'NotIn':
      // Matches when the label is absent, as the API server does.
      return !has || !values.includes(labels[req.key]);
    case 'Exists':
      return has;
    case 'DoesNotExist':
      return !has;
    default:
      // An operator we don't understand must not widen the match.
      return false;
  }
}

/**
 * True when `labels` satisfy `selector`. An absent or empty selector matches
 * everything (NetworkPolicy `podSelector: {}` semantics).
 */
export function matchesLabelSelector(
  selector: LabelSelector | undefined | null,
  labels: Record<string, string> | undefined | null,
): boolean {
  if (isEmptySelector(selector)) return true;
  const actual = labels || {};
  for (const [k, v] of Object.entries(selector!.matchLabels || {})) {
    if (actual[k] !== v) return false;
  }
  for (const req of selector!.matchExpressions || []) {
    if (!requirementMatches(req, actual)) return false;
  }
  return true;
}

/** Stable, kubectl-style string for a selector, e.g. `app=web,tier in (a,b),!legacy`. */
export function selectorToString(selector: LabelSelector | undefined | null): string {
  if (isEmptySelector(selector)) return '';
  const parts = Object.entries(selector!.matchLabels || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const exprs = (selector!.matchExpressions || [])
    .map((req) => {
      const values = [...(req.values || [])].sort().join(',');
      switch (req.operator) {
        case 'In': return `${req.key} in (${values})`;
        case 'NotIn': return `${req.key} notin (${values})`;
        case 'Exists': return req.key;
        case 'DoesNotExist': return `!${req.key}`;
        default: return `${req.key} ${req.operator} (${values})`;
      }
    })
    .sort();
  return [...parts, ...exprs].join(',');
}
