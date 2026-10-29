import type { V1PolicyRule } from '@kubernetes/client-node';
import type { RBACRule } from '@/types/rbac';

/**
 * Keeps resourceNames / nonResourceURLs: dropping them makes a rule scoped to
 * one Secret look like it grants access to every Secret.
 */
export function toRbacRule(rule: V1PolicyRule): RBACRule {
  const out: RBACRule = {
    // A non-resource rule has no API group; defaulting it to core would be misleading.
    apiGroups: rule.apiGroups || (rule.nonResourceURLs?.length ? [] : ['']),
    resources: rule.resources || [],
    verbs: rule.verbs || [],
  };
  if (rule.resourceNames?.length) out.resourceNames = rule.resourceNames;
  if (rule.nonResourceURLs?.length) out.nonResourceURLs = rule.nonResourceURLs;
  return out;
}
