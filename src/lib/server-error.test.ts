import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeServerError } from './server-error';

test('redacts local paths and credential-like values but keeps the failure reason', () => {
  const result = sanitizeServerError(
    'open /Users/alice/.kube/config: permission denied token=secret-value Authorization: Bearer abc.def',
    'Request failed',
  );
  assert.match(result, /permission denied/);
  assert.doesNotMatch(result, /\/Users\/alice/);
  assert.doesNotMatch(result, /secret-value|abc\.def/);
});

test('bounds untrusted error length and uses a fallback for empty values', () => {
  assert.equal(sanitizeServerError('', 'Request failed'), 'Request failed');
  assert.ok(sanitizeServerError('x'.repeat(5000), 'Request failed').length <= 2000);
});

test('fully redacts quoted local paths containing spaces', () => {
  const result = sanitizeServerError(
    'open "/Users/alice/My Folder/config": permission denied; open "C:\\Users\\Alice\\My Folder\\config": permission denied',
    'Request failed',
  );
  assert.match(result, /permission denied/);
  assert.doesNotMatch(result, /\/Users\/alice|Folder\/config|C:\\Users\\Alice|Folder\\config/);
});

test('fully redacts quoted local paths containing the opposite quote', () => {
  const result = sanitizeServerError(
    `open "/Users/alice/O'Brien/config": permission denied; open "C:\\Users\\Alice\\O'Brien\\config": permission denied; open '/Users/alice/He said "yes"/config': permission denied`,
    'Request failed',
  );
  assert.match(result, /permission denied/);
  assert.doesNotMatch(result, /Brien\/config|Brien\\config|He said "yes"\/config/);
});

test('redacts only credential keys and leaves normal words actionable', () => {
  const result = sanitizeServerError(
    'secretary: permission denied tokenizer=failed token=token-value access_token=access-value authToken: auth-value password=pass-value secret=secret-value',
    'Request failed',
  );
  assert.match(result, /secretary: permission denied/);
  assert.match(result, /tokenizer=failed/);
  assert.doesNotMatch(result, /token-value|access-value|auth-value|pass-value|secret-value/);
});

test('returns a fallback when hostile coercion throws', () => {
  const hostile = {
    toString() {
      throw new Error('coercion failed');
    },
  };
  assert.doesNotThrow(() => {
    assert.equal(sanitizeServerError(hostile, 'Request failed'), 'Request failed');
  });
});
