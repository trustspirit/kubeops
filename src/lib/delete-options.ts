/**
 * Garbage-collection policies the Kubernetes API accepts on a delete.
 *
 * The UI lets the user pick one, and silently cascading when they chose
 * "Orphan" is worse than refusing the request, so unknown values are rejected
 * rather than dropped.
 */
export const PROPAGATION_POLICIES = ['Foreground', 'Background', 'Orphan'] as const;

export type PropagationPolicy = (typeof PROPAGATION_POLICIES)[number];

export type PropagationPolicyResult =
  | { ok: true; policy: PropagationPolicy | undefined }
  | { ok: false; error: string };

/** Validates a `propagationPolicy` query parameter. Absent is valid. */
export function parsePropagationPolicy(value: string | null | undefined): PropagationPolicyResult {
  if (value === null || value === undefined || value === '') return { ok: true, policy: undefined };
  if ((PROPAGATION_POLICIES as readonly string[]).includes(value)) {
    return { ok: true, policy: value as PropagationPolicy };
  }
  return { ok: false, error: `Invalid propagationPolicy: ${value}` };
}
