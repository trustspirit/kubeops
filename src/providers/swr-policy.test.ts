import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLRUCache, getErrorRetryDelay, isRetryableError } from './swr-policy';

describe('createLRUCache', () => {
  it('does not evict when an existing key is rewritten at capacity', () => {
    const cache = createLRUCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 3);
    assert.equal(cache.get('a'), 3);
    assert.equal(cache.get('b'), 2);
  });

  it('evicts the least recently used key, counting reads as use', () => {
    const cache = createLRUCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
  });

  it('treats a rewrite as use', () => {
    const cache = createLRUCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);
    assert.deepEqual([...cache.keys()], ['a', 'c']);
  });

  it('does not refresh recency for missing keys', () => {
    const cache = createLRUCache<number>(2);
    assert.equal(cache.get('missing'), undefined);
    assert.deepEqual([...cache.keys()], []);
  });
});

describe('isRetryableError', () => {
  const withStatus = (status: number) => Object.assign(new Error('x'), { status });

  it('retries network failures without a status', () => {
    assert.equal(isRetryableError(new TypeError('Failed to fetch')), true);
  });

  it('retries timeouts, throttling and server errors', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      assert.equal(isRetryableError(withStatus(status)), true, String(status));
    }
  });

  it('stops on auth, permission and not-found errors', () => {
    for (const status of [400, 401, 403, 404]) {
      assert.equal(isRetryableError(withStatus(status)), false, String(status));
    }
  });
});

describe('getErrorRetryDelay', () => {
  const noJitter = { random: () => 0.5 };

  it('backs off exponentially', () => {
    assert.equal(getErrorRetryDelay(1, noJitter), 2000);
    assert.equal(getErrorRetryDelay(2, noJitter), 4000);
    assert.equal(getErrorRetryDelay(3, noJitter), 8000);
  });

  it('caps the delay so recovery is noticed promptly', () => {
    assert.equal(getErrorRetryDelay(50, noJitter), 30000);
    assert.equal(getErrorRetryDelay(50, { random: () => 1 }), 30000);
  });
});
