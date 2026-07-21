import assert from 'node:assert/strict';
import test from 'node:test';
import { getErrorPresentation } from './error-presentation';

test('presents expired Teleport credentials as an authentication problem', () => {
  const result = getErrorPresentation('x509: certificate has expired', 401);
  assert.equal(result.title, 'Authentication required');
  assert.match(result.summary, /session/i);
  assert.equal(result.canLogin, true);
});

test('presents connection failures without exposing the raw stack as the summary', () => {
  const raw = 'connect ECONNREFUSED 10.0.0.1:443 at TCPConnectWrap.afterConnect';
  const result = getErrorPresentation(raw);
  assert.equal(result.title, 'Connection failed');
  assert.notEqual(result.summary, raw);
  assert.equal(result.details, raw);
});

test('keeps an unknown message in expandable details', () => {
  const result = getErrorPresentation('unusual server response');
  assert.equal(result.title, 'Request failed');
  assert.equal(result.details, 'unusual server response');
});
