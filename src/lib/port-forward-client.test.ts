import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMatchingPortForward, type PortForwardInfo } from './port-forward-client';

const forward: PortForwardInfo = {
  id: 'dev/default/pod/api-abc:8080',
  clusterId: 'dev',
  namespace: 'default',
  resourceType: 'pod',
  resourceName: 'api-abc',
  containerPort: 8080,
  localPort: 8081,
  status: 'active',
};

describe('findMatchingPortForward', () => {
  it('matches canonical resource type and every target scope field exactly', () => {
    assert.equal(findMatchingPortForward([forward], {
      clusterId: 'dev',
      namespace: 'default',
      resourceType: 'pods',
      resourceName: 'api-abc',
      containerPort: 8080,
    }), forward);
  });

  it('does not confuse same-name targets in another scope or partial names', () => {
    const base = {
      clusterId: 'dev',
      namespace: 'default',
      resourceType: 'pod',
      resourceName: 'api-abc',
      containerPort: 8080,
    };

    assert.equal(findMatchingPortForward([forward], { ...base, clusterId: 'prod' }), undefined);
    assert.equal(findMatchingPortForward([forward], { ...base, namespace: 'other' }), undefined);
    assert.equal(findMatchingPortForward([forward], { ...base, resourceType: 'service' }), undefined);
    assert.equal(findMatchingPortForward([forward], { ...base, resourceName: 'api' }), undefined);
    assert.equal(findMatchingPortForward([forward], { ...base, containerPort: 8081 }), undefined);
  });
});
