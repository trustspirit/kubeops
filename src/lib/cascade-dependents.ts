/** What the dependents endpoint may say about how complete its scan was. */
export interface DependentsScanMeta {
  /** Set when some lookups were skipped or failed, so the tree may be partial. */
  incomplete?: boolean;
  /** Kinds (or lookups) that could not be listed. */
  failed?: string[];
}

export interface DependentsAssessment {
  /** True when the tree cannot be trusted to show everything a delete will take with it. */
  unknown: boolean;
  reasons: string[];
}

/**
 * Decides whether the cascade dialog may present its tree as the full blast
 * radius. A failed fetch used to fall through to an enabled Delete button with
 * no tree, which read as "nothing depends on this".
 */
export function assessDependents(
  scan: DependentsScanMeta | null | undefined,
  fetchError: string | null | undefined,
): DependentsAssessment {
  const reasons: string[] = [];
  if (fetchError) reasons.push(`Dependents could not be loaded: ${fetchError}`);
  const failed = Array.isArray(scan?.failed) ? scan.failed.filter(Boolean) : [];
  if (failed.length > 0) reasons.push(`Could not check: ${failed.join(', ')}`);
  if (scan?.incomplete && failed.length === 0) reasons.push('The dependents scan was incomplete');
  return { unknown: reasons.length > 0, reasons };
}
