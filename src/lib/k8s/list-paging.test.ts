import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseListPaging, MAX_LIST_LIMIT } from './list-paging';

describe('parseListPaging', () => {
  it('is a no-op when no paging params are given', () => {
    assert.deepEqual(parseListPaging(new URLSearchParams()), { ok: true, args: {} });
  });

  it('maps limit and continue to client-node arguments', () => {
    assert.deepEqual(parseListPaging(new URLSearchParams('limit=500&continue=abc')), { ok: true, args: { limit: 500, _continue: 'abc' } });
  });

  it('rejects invalid limits', () => {
    for (const bad of ['0', '-1', '1.5', 'ten', String(MAX_LIST_LIMIT + 1)]) {
      assert.equal(parseListPaging(new URLSearchParams({ limit: bad })).ok, false, bad);
    }
  });
});
