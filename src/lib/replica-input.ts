/** Upper bound that catches a slipped key (e.g. 30 → 300000) before it reaches the API. */
export const MAX_REPLICAS = 10_000;

export type ReplicaInput =
  | { ok: true; replicas: number }
  | { ok: false; error: string | null };

/**
 * Parses the scale dialog's replica field.
 *
 * `parseInt('') || 0` turned a cleared field into "Scale to 0", one click away
 * from taking a workload down. Empty is now "no value" (no error shown, but
 * nothing to submit); zero must be typed explicitly.
 */
export function parseReplicaInput(raw: string): ReplicaInput {
  const text = raw.trim();
  if (text === '') return { ok: false, error: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Enter a whole number of replicas' };
  const replicas = Number(text);
  if (!Number.isSafeInteger(replicas) || replicas > MAX_REPLICAS) {
    return { ok: false, error: `At most ${MAX_REPLICAS} replicas` };
  }
  return { ok: true, replicas };
}

/** The merge patch that sets only the replica count, leaving the rest of the spec alone. */
export function buildScalePatch(replicas: number): { spec: { replicas: number } } {
  return { spec: { replicas } };
}
