import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildKubectlExecArgs, validateExecTarget } from './exec-validation';

describe('exec validation', () => {
  it('builds direct kubectl arguments without a local shell', () => {
    const result = validateExecTarget({
      clusterId: 'dev-context', namespace: 'default', podName: 'api-7d9f', container: 'api',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(buildKubectlExecArgs(result.value), [
      'exec', '-i', '-t', '--context', 'dev-context', '-n', 'default', '-c', 'api',
      'api-7d9f', '--', 'sh', '-c', 'clear; (bash || ash || sh)',
    ]);
  });

  it('rejects control characters and invalid Kubernetes names', () => {
    assert.equal(validateExecTarget({ clusterId: 'dev\n--kubeconfig=x', namespace: 'default', podName: 'api', container: 'api' }).ok, false);
    assert.equal(validateExecTarget({ clusterId: 'dev', namespace: '../default', podName: 'api', container: 'api' }).ok, false);
    assert.equal(validateExecTarget({ clusterId: 'dev', namespace: 'default', podName: "api';id", container: 'api' }).ok, false);
  });
});
