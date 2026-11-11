import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getClusterEnvironment, isProductionCluster } from './cluster-environment';

describe('cluster environment detection', () => {
  it('classifies clusters by whole name segments', () => {
    assert.equal(getClusterEnvironment('ovdr-teleport-prod-alp-gcp-asse1-i04'), 'production');
    assert.equal(getClusterEnvironment('ovdr-teleport-staging-alp-aws-use1-o01'), 'staging');
    assert.equal(getClusterEnvironment('ovdr-teleport-dev-alp-aws-apne2-a02'), 'development');
    assert.equal(getClusterEnvironment('docker-desktop'), 'development');
    assert.equal(getClusterEnvironment('arn:aws:eks:us-east-1:1234:cluster/PROD_main'), 'production');
  });

  it('does not match markers inside longer words', () => {
    assert.equal(getClusterEnvironment('reproducer'), null);
    assert.equal(getClusterEnvironment('device-farm'), null);
    assert.equal(getClusterEnvironment('ovdr-teleport-central-ea'), null);
    assert.equal(getClusterEnvironment(''), null);
    assert.equal(getClusterEnvironment(undefined), null);
  });

  it('treats a name with several markers as production', () => {
    assert.equal(getClusterEnvironment('dev-tools-prod'), 'production');
    assert.equal(isProductionCluster('dev-tools-prod'), true);
    assert.equal(isProductionCluster('dev-1'), false);
  });
});
