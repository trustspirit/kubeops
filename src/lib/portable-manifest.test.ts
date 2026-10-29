import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as yaml from 'js-yaml';
import { looksLikeResource, toEditableYaml, toPortableResource, toPortableYaml } from './portable-manifest';

const live = () => ({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'web',
    namespace: 'prod',
    labels: { app: 'web' },
    annotations: {
      'kubectl.kubernetes.io/last-applied-configuration': '{}',
      team: 'core',
    },
    uid: 'abc',
    resourceVersion: '42',
    creationTimestamp: '2026-01-01T00:00:00Z',
    generation: 7,
    managedFields: [{ manager: 'kubectl' }],
    ownerReferences: [{ kind: 'Foo', uid: 'source-cluster-uid' }],
  },
  spec: { replicas: 3 },
  status: { readyReplicas: 2, observedGeneration: 7 },
});

describe('toPortableResource', () => {
  it('drops status and server-owned metadata, keeping user fields', () => {
    const clean = toPortableResource(live());
    assert.equal('status' in clean, false);
    assert.deepEqual(clean.spec, { replicas: 3 });
    assert.deepEqual(clean.metadata, {
      name: 'web',
      namespace: 'prod',
      labels: { app: 'web' },
      annotations: { team: 'core' },
    });
  });

  it('does not mutate the input', () => {
    const input = live();
    toPortableResource(input);
    assert.equal(input.metadata.uid, 'abc');
    assert.ok(input.status);
    assert.ok(input.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']);
  });

  it('removes the annotations map when only last-applied was present', () => {
    const input = live();
    input.metadata.annotations = { 'kubectl.kubernetes.io/last-applied-configuration': '{}' } as typeof input.metadata.annotations;
    const meta = toPortableResource(input).metadata as Record<string, unknown>;
    assert.equal('annotations' in meta, false);
  });
});

describe('toPortableYaml', () => {
  it('is stable across polls that only change status', () => {
    const a = live();
    const b = live();
    b.status.readyReplicas = 3;
    b.metadata.resourceVersion = '43';
    assert.equal(toPortableYaml(a), toPortableYaml(b));
  });

  it('round-trips as YAML and is empty for missing data', () => {
    assert.equal((yaml.load(toPortableYaml(live())) as { kind: string }).kind, 'Deployment');
    assert.equal(toPortableYaml(undefined), '');
  });
});

describe('toEditableYaml', () => {
  it('keeps resourceVersion for conflict detection but drops status and managedFields', () => {
    const parsed = yaml.load(toEditableYaml(live())) as ReturnType<typeof live>;
    assert.equal(parsed.metadata.resourceVersion, '42');
    assert.equal(parsed.metadata.uid, 'abc');
    assert.equal('managedFields' in parsed.metadata, false);
    assert.equal('status' in parsed, false);
  });
});

describe('looksLikeResource', () => {
  it('accepts objects with kind and metadata only', () => {
    assert.equal(looksLikeResource(live()), true);
    assert.equal(looksLikeResource(undefined), false);
    assert.equal(looksLikeResource({ kind: 'Pod' }), false);
  });
});
