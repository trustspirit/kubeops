import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { messageFromStatusBody, resolvePatchContentType } from './raw-request';

describe('resolvePatchContentType', () => {
  it('honours the patch media types', () => {
    assert.equal(resolvePatchContentType('application/merge-patch+json', 'application/strategic-merge-patch+json'), 'application/merge-patch+json');
    assert.equal(resolvePatchContentType('application/json-patch+json; charset=utf-8', 'application/strategic-merge-patch+json'), 'application/json-patch+json');
  });

  it('falls back for plain JSON or a missing header', () => {
    assert.equal(resolvePatchContentType('application/json', 'application/strategic-merge-patch+json'), 'application/strategic-merge-patch+json');
    assert.equal(resolvePatchContentType(null, 'application/merge-patch+json'), 'application/merge-patch+json');
  });
});

describe('messageFromStatusBody', () => {
  it('returns the Status message, not the raw JSON', () => {
    const raw = JSON.stringify({ kind: 'Status', message: 'deployments.apps "web" not found', code: 404 });
    assert.equal(messageFromStatusBody(raw, 'fallback'), 'deployments.apps "web" not found');
    assert.equal(messageFromStatusBody({ message: 'forbidden' }, 'fallback'), 'forbidden');
  });

  it('keeps plain-text bodies and falls back when empty', () => {
    assert.equal(messageFromStatusBody('404 page not found', 'fallback'), '404 page not found');
    assert.equal(messageFromStatusBody('', 'fallback'), 'fallback');
    assert.equal(messageFromStatusBody({}, 'fallback'), 'fallback');
  });
});
