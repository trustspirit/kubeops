import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { singularize } from './kubectl-command';

describe('singularize', () => {
  it('uses the explicit map for the common Kubernetes kinds', () => {
    assert.equal(singularize('pods'), 'pod');
    assert.equal(singularize('ingresses'), 'ingress');
    assert.equal(singularize('networkpolicies'), 'networkpolicy');
    assert.equal(singularize('endpoints'), 'endpoints');
  });

  it('handles -es plurals without leaving a trailing e', () => {
    assert.equal(singularize('storageclasses'), 'storageclass');
    assert.equal(singularize('boxes'), 'box');
  });

  it('handles -ies plurals', () => {
    assert.equal(singularize('policies'), 'policy');
  });

  it('handles plain -s plurals', () => {
    assert.equal(singularize('widgets'), 'widget');
  });

  it('leaves already-singular words alone', () => {
    assert.equal(singularize('ingress'), 'ingress');
    assert.equal(singularize('gateway'), 'gateway');
  });
});
