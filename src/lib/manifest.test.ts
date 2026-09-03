import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeResource, MAX_MANIFEST_DOCUMENTS, parseManifest } from './manifest';

const configMap = (name: string) => `
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
  key: value
`.trim();

describe('parseManifest', () => {
  it('accepts a single document', () => {
    const result = parseManifest(configMap('one'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].metadata?.name, 'one');
  });

  it('accepts a multi-document manifest, which yaml.load used to reject outright', () => {
    const result = parseManifest(`${configMap('one')}\n---\n${configMap('two')}`);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.documents.map((d) => d.metadata?.name), ['one', 'two']);
  });

  it('preserves document order so a Namespace declared first is applied first', () => {
    const manifest = [
      'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: team-a',
      configMap('settings'),
    ].join('\n---\n');
    const result = parseManifest(manifest);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.documents.map((d) => d.kind), ['Namespace', 'ConfigMap']);
  });

  it('ignores empty documents produced by leading and trailing separators', () => {
    const result = parseManifest(`---\n${configMap('one')}\n---\n`);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.documents.length, 1);
  });

  it('rejects a manifest with no resource objects', () => {
    const result = parseManifest('---\n---\n');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /at least one Kubernetes resource/);
  });

  it('rejects a scalar document', () => {
    const result = parseManifest('just a string');
    assert.equal(result.ok, false);
  });

  it('rejects a top-level array', () => {
    const result = parseManifest('- kind: ConfigMap');
    assert.equal(result.ok, false);
  });

  it('reports which document is missing a required field', () => {
    const result = parseManifest(`${configMap('one')}\n---\napiVersion: v1\nkind: ConfigMap`);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /metadata\.name.*document 2/);
  });

  it('omits the document index when there is only one', () => {
    const result = parseManifest('apiVersion: v1\nkind: ConfigMap');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.doesNotMatch(result.error, /document/);
  });

  it('reports invalid YAML rather than throwing', () => {
    const result = parseManifest('key: [unclosed');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /^Invalid YAML:/);
  });

  it('caps the number of documents', () => {
    const many = Array.from({ length: MAX_MANIFEST_DOCUMENTS + 1 }, (_, i) => configMap(`cm-${i}`));
    const result = parseManifest(many.join('\n---\n'));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Too many documents/);
  });

  it('allows exactly the maximum', () => {
    const many = Array.from({ length: MAX_MANIFEST_DOCUMENTS }, (_, i) => configMap(`cm-${i}`));
    assert.equal(parseManifest(many.join('\n---\n')).ok, true);
  });
});

describe('describeResource', () => {
  it('identifies a document for per-document result rows', () => {
    assert.equal(
      describeResource({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings' } }),
      'ConfigMap/settings',
    );
  });
});
