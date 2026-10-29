import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractK8sError, isObjectNotFound } from './error-handling';

describe('extractK8sError', () => {
  it('reads client-node 1.x ApiException (.code + JSON string body)', () => {
    const err = { code: 404, body: JSON.stringify({ message: 'pods "x" not found' }), message: 'HTTP-Code: 404 ...' };
    assert.deepEqual(extractK8sError(err), { status: 404, message: 'pods "x" not found' });
  });

  it('still reads legacy statusCode / parsed body shapes', () => {
    assert.deepEqual(extractK8sError({ statusCode: 403, body: { message: 'forbidden' } }), { status: 403, message: 'forbidden' });
    assert.equal(extractK8sError({ response: { statusCode: 409 } }).status, 409);
  });

  it('ignores non-HTTP codes such as ECONNREFUSED', () => {
    assert.deepEqual(extractK8sError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }), { status: 500, message: 'connect ECONNREFUSED' });
  });
});

describe('isObjectNotFound', () => {
  const status = (name?: string) => JSON.stringify({ kind: 'Status', reason: 'NotFound', details: name ? { name } : {} });

  it('is true only when the named object is the one missing', () => {
    assert.equal(isObjectNotFound(404, status('web'), 'web'), true);
    assert.equal(isObjectNotFound(404, { reason: 'NotFound', details: { name: 'web' } }, 'web'), true);
  });

  it('is false for a missing resource type / API path, other names, or other statuses', () => {
    assert.equal(isObjectNotFound(404, status(), 'web'), false);
    assert.equal(isObjectNotFound(404, '404 page not found', 'web'), false);
    assert.equal(isObjectNotFound(404, status('other'), 'web'), false);
    assert.equal(isObjectNotFound(403, status('web'), 'web'), false);
  });
});
