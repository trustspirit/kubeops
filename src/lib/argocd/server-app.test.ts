import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyArgoCDCliError,
  getArgoCDServerAppUrl,
  summarizeServerApp,
  toArgoCDAppRef,
} from './server-app';

describe('classifyArgoCDCliError', () => {
  it('recognises an expired or missing login', () => {
    assert.equal(classifyArgoCDCliError('rpc error: code = Unauthenticated desc = invalid session: token has invalid claims'), 'auth');
    assert.equal(classifyArgoCDCliError('FATA[0000] Argo CD server address unspecified; please login'), 'auth');
    assert.equal(classifyArgoCDCliError(
      '{"level":"fatal","msg":"oauth2: \\"invalid_grant\\" \\"AADSTS700082: The refresh token has expired due to inactivity."}',
    ), 'auth');
  });

  it('treats permission denied like not found, as Argo CD does for missing apps', () => {
    assert.equal(classifyArgoCDCliError('rpc error: code = PermissionDenied desc = permission denied'), 'not-found');
    assert.equal(classifyArgoCDCliError('rpc error: code = NotFound desc = applications.argoproj.io "x" not found'), 'not-found');
  });

  it('leaves anything else as a real failure', () => {
    assert.equal(classifyArgoCDCliError('dial tcp: lookup argocd-root.ovdr.io: no such host'), 'other');
  });
});

describe('server app helpers', () => {
  it('summarises status and destination', () => {
    assert.deepEqual(summarizeServerApp({
      metadata: { name: 'workflow-platform', namespace: 'argocd' },
      spec: { project: 'central', destination: { name: 'central-ea', namespace: 'workflow' } },
      status: { sync: { status: 'Synced' }, health: { status: 'Healthy' } },
    }), {
      name: 'workflow-platform',
      namespace: 'argocd',
      project: 'central',
      syncStatus: 'Synced',
      healthStatus: 'Healthy',
      destinationServer: undefined,
      destinationName: 'central-ea',
      destinationNamespace: 'workflow',
    });
  });

  it('addresses namespaced apps as ns/name', () => {
    assert.equal(toArgoCDAppRef('oka'), 'oka');
    assert.equal(toArgoCDAppRef('oka', 'team-a'), 'team-a/oka');
  });

  it('builds the web UI link from a bare host or URL', () => {
    assert.equal(
      getArgoCDServerAppUrl('argocd-root.ovdr.io', { name: 'oasis', namespace: 'argocd' }),
      'https://argocd-root.ovdr.io/applications/argocd/oasis',
    );
    assert.equal(
      getArgoCDServerAppUrl('https://argocd-root.ovdr.io/', { name: 'oasis', namespace: '' }),
      'https://argocd-root.ovdr.io/applications/oasis',
    );
  });
});
