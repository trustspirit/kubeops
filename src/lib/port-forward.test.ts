import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { describe, it } from 'node:test';
import {
  createPortForwardId,
  findAvailableLoopbackPort,
  validatePortForwardRequest,
} from './port-forward';

describe('port-forward validation', () => {
  it('normalizes aliases and creates a cluster/namespace-scoped identity', () => {
    const result = validatePortForwardRequest({
      clusterId: 'dev', namespace: 'default', resourceType: 'services',
      resourceName: 'api', containerPort: 8080, localPort: 18080,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.resourceType, 'service');
    assert.equal(createPortForwardId(result.value), 'dev/default/service/api:8080');
  });

  it('rejects unsupported targets and invalid port values', () => {
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'deployment', resourceName: 'api', containerPort: 80 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: 0 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: '80' }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: Number.NaN }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: 80.5 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: 65536 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: 80, localPort: 0 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceType: 'pod', resourceName: 'api', containerPort: 80, localPort: '8080' }).ok, false);
  });

  it('validates every scalar and defaults only an undefined local port', () => {
    const valid = validatePortForwardRequest({
      clusterId: 'dev', namespace: 'default', resourceName: 'api', containerPort: 8080,
    });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.value.resourceType, 'pod');
      assert.equal(valid.value.localPort, 8080);
    }

    assert.equal(validatePortForwardRequest(null).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: '-dev', namespace: 'default', resourceName: 'api', containerPort: 80 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'Not-DNS', resourceName: 'api', containerPort: 80 }).ok, false);
    assert.equal(validatePortForwardRequest({ clusterId: 'dev', namespace: 'default', resourceName: '../api', containerPort: 80 }).ok, false);
  });
});

describe('loopback port selection', () => {
  it('skips ports occupied on loopback and closes its availability probe', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject);
      occupied.listen({ host: '127.0.0.1', port: 0 }, resolve);
    });

    const address = occupied.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const selected = await findAvailableLoopbackPort(address.port, new Set());
      assert.notEqual(selected, address.port);

      const verification = createServer();
      await new Promise<void>((resolve, reject) => {
        verification.once('error', reject);
        verification.listen({ host: '127.0.0.1', port: selected }, resolve);
      });
      await new Promise<void>((resolve, reject) => verification.close(error => error ? reject(error) : resolve()));
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close(error => error ? reject(error) : resolve()));
    }
  });

  it('skips reserved ports and stops after 100 candidates', async () => {
    assert.equal(await findAvailableLoopbackPort(18080, new Set([18080])), 18081);
    const reserved = new Set(Array.from({ length: 100 }, (_, index) => 20000 + index));
    await assert.rejects(findAvailableLoopbackPort(20000, reserved), /No available local port found/);
  });
});
