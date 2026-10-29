/**
 * Client-side bookkeeping for the multi-cluster apply wizard.
 *
 * The API returns one result per (target, document). The wizard used to show
 * whatever came back and compare counts, so a missing result, a duplicate, or
 * a response for a target list the user had since changed could all read as
 * "everything succeeded". Results are matched to the expected
 * (target × document) grid by key instead.
 */

export interface ApplyTarget {
  clusterId: string;
  namespace: string;
}

export interface ApplyResult {
  clusterId: string;
  namespace: string;
  status: 'success' | 'error';
  message?: string;
  /** `Kind/name`; the API sets it for multi-document manifests (and may always). */
  resource?: string;
  /** The request timed out: the change may or may not have landed on the cluster. */
  timedOut?: boolean;
}

/** One row of the expected grid, always naming its resource. */
export interface ApplyRow extends ApplyResult {
  resource: string;
}

const SEP = '\u0000';

export function targetKey(target: ApplyTarget): string {
  return `${target.clusterId}${SEP}${target.namespace}`;
}

export function rowKey(target: ApplyTarget, resource: string): string {
  return `${targetKey(target)}${SEP}${resource}`;
}

/** Identifies what a run was for, so a response for an older selection is not shown. */
export function snapshotKey(targets: ApplyTarget[], yamlText: string): string {
  const keys = targets.map(targetKey).sort();
  return `${keys.join('\u0001')}\u0002${yamlText}`;
}

/**
 * Lays the API's results onto the expected grid.
 *
 * - A result carrying `resource` matches by key.
 * - Without `resource` (single-document responses, older API) a target's
 *   results are taken in manifest order, which is the order the API emits.
 * - `targetFailures` (e.g. a failed auth preflight) fail every document for
 *   their target.
 * - Anything still missing becomes an explicit error rather than silently
 *   shrinking the total.
 */
export function reconcileResults(
  targets: ApplyTarget[],
  resources: string[],
  results: ApplyResult[],
  targetFailures: ApplyResult[] = [],
): ApplyRow[] {
  const byKey = new Map<string, ApplyResult>();
  const unnamed = new Map<string, ApplyResult[]>();
  for (const result of results) {
    if (result.resource) {
      byKey.set(rowKey(result, result.resource), result);
    } else {
      const key = targetKey(result);
      const list = unnamed.get(key) ?? [];
      list.push(result);
      unnamed.set(key, list);
    }
  }
  const failureByTarget = new Map(targetFailures.map((f) => [targetKey(f), f] as const));

  const rows: ApplyRow[] = [];
  for (const target of targets) {
    const tKey = targetKey(target);
    const failure = failureByTarget.get(tKey);
    const positional = unnamed.get(tKey) ?? [];
    resources.forEach((resource, index) => {
      const base = { clusterId: target.clusterId, namespace: target.namespace, resource };
      if (failure) {
        rows.push({ ...base, status: 'error', message: failure.message });
        return;
      }
      const match = byKey.get(rowKey(target, resource)) ?? positional[index];
      if (!match) {
        rows.push({ ...base, status: 'error', message: 'No result was returned for this target' });
      } else {
        rows.push(match.timedOut
          ? { ...base, status: match.status, message: match.message, timedOut: true }
          : { ...base, status: match.status, message: match.message });
      }
    });
  }
  return rows;
}

/** Every expected row is present and succeeded. */
export function allSucceeded(rows: ApplyRow[], targets: ApplyTarget[], resources: string[]): boolean {
  return (
    rows.length === targets.length * resources.length &&
    rows.length > 0 &&
    rows.every((row) => row.status === 'success')
  );
}

/** Targets with at least one failed document, in their original order. */
export function failedTargets(rows: ApplyRow[], targets: ApplyTarget[]): ApplyTarget[] {
  const failed = new Set(rows.filter((r) => r.status === 'error').map(targetKey));
  return targets.filter((t) => failed.has(targetKey(t)));
}

/** Replaces the rows of the retried targets, keeping everything else in place. */
export function mergeRetriedRows(previous: ApplyRow[], retried: ApplyRow[]): ApplyRow[] {
  const replacements = new Map(retried.map((row) => [rowKey(row, row.resource), row] as const));
  return previous.map((row) => replacements.get(rowKey(row, row.resource)) ?? row);
}

export function summarizeRows(rows: ApplyRow[]) {
  const succeeded = rows.filter((r) => r.status === 'success').length;
  return { succeeded, failed: rows.length - succeeded, total: rows.length };
}
