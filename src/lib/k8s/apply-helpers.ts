/**
 * Pure helpers for the multi-cluster apply route, split out so they can be
 * unit-tested without a cluster.
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects with TimeoutError if `promise` hasn't settled within `ms`. The
 * underlying request is not cancelled; this only stops one hung cluster from
 * holding up every other target's result.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Maps `items` through `fn` with at most `limit` in flight; results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

interface StatusLike {
  reason?: string;
  message?: string;
  details?: { causes?: Array<{ reason?: string; field?: string; message?: string }> };
}

function parseStatus(body: unknown): StatusLike | undefined {
  let parsed = body;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return undefined; }
  }
  return parsed && typeof parsed === 'object' ? (parsed as StatusLike) : undefined;
}

/**
 * True for a Server-Side Apply field-ownership conflict (HTTP 409 where
 * another field manager, e.g. `kubectl` or a controller, owns a field this
 * manifest sets).
 */
export function isFieldManagerConflict(status: number, body: unknown): boolean {
  if (status !== 409) return false;
  const s = parseStatus(body);
  if (!s) return false;
  if (s.details?.causes?.some((c) => c.reason === 'FieldManagerConflict')) return true;
  return typeof s.message === 'string' && /^Apply failed with \d+ conflicts?/.test(s.message);
}

/** Explains an SSA conflict and how to resolve it, keeping the server's field list. */
export function describeFieldManagerConflict(serverMessage: string): string {
  return `Field ownership conflict: ${serverMessage}. Another manager owns these fields; `
    + 'remove them from the manifest, or re-apply with "force" to take ownership.';
}
