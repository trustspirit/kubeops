import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyWatchEvent, isResourceVersionExpired, nextBackoff } from './watch-manager';

describe('applyWatchEvent', () => {
  it('tracks resourceVersion and resets backoff on normal events', () => {
    const next = applyWatchEvent(
      { resourceVersion: '10', backoffMs: 8000 },
      'MODIFIED',
      { metadata: { resourceVersion: '42' } },
    );
    assert.deepEqual(next, { resourceVersion: '42', backoffMs: 1000 });
  });

  it('keeps the previous cursor when an event has no resourceVersion', () => {
    const next = applyWatchEvent({ resourceVersion: '10', backoffMs: 4000 }, 'ADDED', {});
    assert.deepEqual(next, { resourceVersion: '10', backoffMs: 1000 });
  });

  it('clears resourceVersion on an in-stream 410 Status and keeps backoff', () => {
    const status = { kind: 'Status', code: 410, reason: 'Expired', metadata: { resourceVersion: '999' } };
    const next = applyWatchEvent({ resourceVersion: '10', backoffMs: 4000 }, 'ERROR', status);
    assert.deepEqual(next, { resourceVersion: '', backoffMs: 4000 });
  });

  it('never adopts a resourceVersion from a non-410 ERROR Status', () => {
    const status = { kind: 'Status', code: 500, metadata: { resourceVersion: '999' } };
    const next = applyWatchEvent({ resourceVersion: '10', backoffMs: 2000 }, 'ERROR', status);
    assert.deepEqual(next, { resourceVersion: '10', backoffMs: 2000 });
  });
});

describe('isResourceVersionExpired', () => {
  it('recognises 410 in statusCode, code, or body.code', () => {
    assert.equal(isResourceVersionExpired({ statusCode: 410 }), true);
    assert.equal(isResourceVersionExpired({ code: 410 }), true);
    assert.equal(isResourceVersionExpired({ body: { code: 410 } }), true);
    assert.equal(isResourceVersionExpired({ code: 401 }), false);
    assert.equal(isResourceVersionExpired(null), false);
    assert.equal(isResourceVersionExpired('410'), false);
  });
});

describe('nextBackoff', () => {
  it('doubles up to the cap', () => {
    assert.deepEqual(nextBackoff(1000), { delay: 1000, next: 2000 });
    assert.deepEqual(nextBackoff(20000), { delay: 20000, next: 30000 });
    assert.deepEqual(nextBackoff(30000), { delay: 30000, next: 30000 });
  });
});
