import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getResourceNamespace,
  getResourceNodeId,
  getResourceBasePath,
  resourcesShareNamespace,
} from './resource-tree-identity';

const resource = { metadata: { name: 'api', namespace: 'production' } };

describe('App Map resource identity', () => {
  it('includes namespace in node IDs for an all-namespaces map', () => {
    assert.equal(getResourceNodeId('Pod', resource, '_all'), 'production/Pod/api');
    assert.equal(getResourceNodeId('Pod', resource, 'production'), 'Pod/api');
  });

  it('links details to the resource namespace in an all-namespaces map', () => {
    assert.equal(
      getResourceBasePath('dev cluster', resource, '_all'),
      '/clusters/dev%20cluster/namespaces/production',
    );
  });

  it('falls back to the selected namespace when metadata omits it', () => {
    assert.equal(getResourceNamespace({ metadata: { name: 'api' } }, 'staging'), 'staging');
  });

  it('prevents selectors from crossing namespace boundaries', () => {
    assert.equal(
      resourcesShareNamespace(resource, { metadata: { name: 'pod', namespace: 'production' } }, '_all'),
      true,
    );
    assert.equal(
      resourcesShareNamespace(resource, { metadata: { name: 'pod', namespace: 'staging' } }, '_all'),
      false,
    );
  });
});
