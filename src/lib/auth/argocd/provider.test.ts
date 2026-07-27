import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { argocdProvider } from './provider';

describe('argocdProvider', () => {
  it('has the expected identity', () => {
    assert.equal(argocdProvider.id, 'argocd');
    assert.equal(argocdProvider.name, 'ArgoCD');
  });
  it('exposes a required Server field', () => {
    const fields = argocdProvider.getConfigFields();
    const server = fields.find((f) => f.key === 'server');
    assert.ok(server, 'server field exists');
    assert.equal(server?.required, true);
  });
  it('offers an auth mode select including sso', () => {
    const fields = argocdProvider.getConfigFields();
    const mode = fields.find((f) => f.key === 'authMode');
    assert.equal(mode?.type, 'select');
    assert.ok(mode?.options?.some((o) => o.value === 'sso'));
  });
  it('does not offer username-password auth mode', () => {
    const fields = argocdProvider.getConfigFields();
    const mode = fields.find((f) => f.key === 'authMode');
    assert.equal(mode?.options?.some((o) => o.value === 'username-password'), false);
  });
});
