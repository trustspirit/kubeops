import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePropagationPolicy, PROPAGATION_POLICIES } from './delete-options';

describe('parsePropagationPolicy', () => {
  it('accepts every policy the dialog offers', () => {
    for (const policy of PROPAGATION_POLICIES) {
      const result = parsePropagationPolicy(policy);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.policy, policy);
    }
  });

  it('treats an absent policy as "let the server decide"', () => {
    for (const value of [null, undefined, '']) {
      const result = parsePropagationPolicy(value);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.policy, undefined);
    }
  });

  it('rejects an unknown policy instead of falling back to a cascading delete', () => {
    const result = parsePropagationPolicy('Bogus');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Invalid propagationPolicy: Bogus/);
  });

  it('is case-sensitive, matching the Kubernetes API', () => {
    assert.equal(parsePropagationPolicy('orphan').ok, false);
  });
});
