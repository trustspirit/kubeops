import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toggleNamespaceSelection } from './namespace-selection';

describe('toggleNamespaceSelection', () => {
  it('keeps the first selection so multi-select can continue', () => {
    assert.deepEqual(toggleNamespaceSelection([], 'alpha'), ['alpha']);
  });

  it('adds a second namespace without mutating the input', () => {
    const selected = ['alpha'];
    assert.deepEqual(toggleNamespaceSelection(selected, 'beta'), ['alpha', 'beta']);
    assert.deepEqual(selected, ['alpha']);
  });

  it('removes an already selected namespace', () => {
    assert.deepEqual(toggleNamespaceSelection(['alpha', 'beta'], 'alpha'), ['beta']);
  });
});
