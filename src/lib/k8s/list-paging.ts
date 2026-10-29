/** Upper bound so a typo can't request an unbounded page. */
export const MAX_LIST_LIMIT = 5000;

export type ListPagingResult =
  | { ok: true; args: { limit?: number; _continue?: string } }
  | { ok: false; error: string };

/**
 * Reads opt-in `limit` / `continue` list paging from query params into
 * client-node 1.x list arguments. Absent params mean "no paging".
 */
export function parseListPaging(params: URLSearchParams): ListPagingResult {
  const args: { limit?: number; _continue?: string } = {};
  const rawLimit = params.get('limit');
  if (rawLimit !== null && rawLimit !== '') {
    if (!/^\d+$/.test(rawLimit)) return { ok: false, error: 'limit must be a positive integer' };
    const limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_LIST_LIMIT) {
      return { ok: false, error: `limit must be between 1 and ${MAX_LIST_LIMIT}` };
    }
    args.limit = limit;
  }
  const cont = params.get('continue');
  if (cont) args._continue = cont;
  return { ok: true, args };
}
