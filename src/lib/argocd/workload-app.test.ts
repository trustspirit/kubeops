import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ArgoCDApplication } from './helpers';
import {
  findWorkloadArgoCDApp,
  getWorkloadArgoCDCandidates,
  hasArgoCDSpecificCandidate,
  parseArgoCDTrackingId,
} from './workload-app';

function app(name: string, namespace: string, destination: NonNullable<ArgoCDApplication['spec']>['destination']): ArgoCDApplication {
  return { metadata: { name, namespace }, spec: { destination } };
}

describe('parseArgoCDTrackingId', () => {
  it('reads the application from an annotation tracking id', () => {
    assert.deepEqual(parseArgoCDTrackingId('api-prod:apps/Deployment:prod/api'), { name: 'api-prod' });
  });

  it('splits an apps-in-any-namespace application name', () => {
    assert.deepEqual(parseArgoCDTrackingId('team-a_api:apps/Deployment:prod/api'), { namespace: 'team-a', name: 'api' });
  });

  it('ignores empty values', () => {
    assert.equal(parseArgoCDTrackingId(undefined), null);
    assert.equal(parseArgoCDTrackingId(':apps/Deployment:prod/api'), null);
  });
});

describe('getWorkloadArgoCDCandidates', () => {
  it('orders the owner tracking id before pod labels and dedupes', () => {
    const pod = { metadata: { name: 'api-1', labels: { 'app.kubernetes.io/instance': 'api-prod', 'argocd.argoproj.io/instance': 'api-prod' } } };
    const deployment = { metadata: { name: 'api', annotations: { 'argocd.argoproj.io/tracking-id': 'api-prod:apps/Deployment:prod/api' } } };
    const candidates = getWorkloadArgoCDCandidates([pod, deployment, undefined]);
    assert.deepEqual(candidates, [{ name: 'api-prod', source: 'tracking-id' }]);
    assert.equal(hasArgoCDSpecificCandidate(candidates), true);
  });

  it('treats a Helm instance label alone as a weak signal', () => {
    const candidates = getWorkloadArgoCDCandidates([{ metadata: { name: 'x', labels: { 'app.kubernetes.io/instance': 'redis' } } }]);
    assert.deepEqual(candidates, [{ name: 'redis', source: 'instance-label' }]);
    assert.equal(hasArgoCDSpecificCandidate(candidates), false);
  });
});

describe('findWorkloadArgoCDApp', () => {
  const candidates = [{ name: 'api-prod', source: 'tracking-id' as const }];

  it('finds an in-cluster application on the workload cluster', () => {
    const match = findWorkloadArgoCDApp({
      workloadClusterId: 'prod',
      workloadNamespace: 'prod',
      candidates,
      hosts: [{ hostClusterId: 'prod', apps: [app('api-prod', 'argocd', { server: 'https://kubernetes.default.svc', namespace: 'prod' })] }],
    });
    assert.equal(match?.hostClusterId, 'prod');
    assert.equal(match?.namespace, 'argocd');
    assert.equal(match?.ambiguous, false);
  });

  it('finds the application on a central Argo CD cluster', () => {
    const match = findWorkloadArgoCDApp({
      workloadClusterId: 'prod',
      workloadNamespace: 'prod',
      candidates,
      hosts: [
        { hostClusterId: 'prod', apps: [] },
        { hostClusterId: 'central', apps: [app('api-prod', 'argocd', { server: 'https://prod.example.com', namespace: 'prod' })] },
      ],
    });
    assert.equal(match?.hostClusterId, 'central');
  });

  it('never picks a central application that deploys to the central cluster itself', () => {
    const match = findWorkloadArgoCDApp({
      workloadClusterId: 'prod',
      candidates,
      hosts: [{ hostClusterId: 'central', apps: [app('api-prod', 'argocd', { server: 'https://kubernetes.default.svc/' })] }],
    });
    assert.equal(match, null);
  });

  it('prefers the application whose destination server is the workload cluster', () => {
    const match = findWorkloadArgoCDApp({
      workloadClusterId: 'prod',
      workloadServer: 'https://prod.example.com/',
      candidates,
      hosts: [{
        hostClusterId: 'central',
        apps: [
          app('api-prod', 'team-b', { server: 'https://staging.example.com' }),
          app('api-prod', 'team-a', { server: 'https://PROD.example.com' }),
        ],
      }],
    });
    assert.equal(match?.namespace, 'team-a');
    assert.equal(match?.ambiguous, false);
  });

  it('flags equally good matches as ambiguous', () => {
    const match = findWorkloadArgoCDApp({
      workloadClusterId: 'prod',
      candidates,
      hosts: [
        { hostClusterId: 'central-a', apps: [app('api-prod', 'argocd', { server: 'https://a' })] },
        { hostClusterId: 'central-b', apps: [app('api-prod', 'argocd', { server: 'https://b' })] },
      ],
    });
    assert.equal(match?.ambiguous, true);
  });

  it('respects the application namespace from the tracking id', () => {
    const match = findWorkloadArgoCDApp({
      workloadClusterId: 'prod',
      candidates: [{ name: 'api', namespace: 'team-a', source: 'tracking-id' }],
      hosts: [{ hostClusterId: 'central', apps: [app('api', 'team-b', { server: 'https://prod' })] }],
    });
    assert.equal(match, null);
  });
});
