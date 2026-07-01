import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildArgoCDRefreshPatch,
  buildArgoCDSyncPatch,
  findArgoCDAppName,
  findArgoCDApplicationRefForResource,
  getArgoCDAppNameCandidates,
  getArgoCDAppSourceSummary,
} from './helpers';

describe('findArgoCDAppName', () => {
  it('reads the standard Argo CD instance label', () => {
    assert.equal(
      findArgoCDAppName({
        metadata: {
          name: 'api-7d9f4',
          labels: {
            'argocd.argoproj.io/instance': 'api-prod',
          },
        },
      }),
      'api-prod',
    );
  });

  it('returns null when no Argo CD metadata exists', () => {
    assert.equal(findArgoCDAppName({ metadata: { name: 'api-7d9f4' } }), null);
  });
});

describe('getArgoCDAppNameCandidates', () => {
  it('uses Argo CD label before common app instance label', () => {
    assert.deepEqual(
      getArgoCDAppNameCandidates({
        metadata: {
          name: 'api-7d9f4',
          labels: {
            'argocd.argoproj.io/instance': 'api-argocd',
            'app.kubernetes.io/instance': 'api-helm',
          },
        },
      }),
      ['api-argocd', 'api-helm'],
    );
  });

  it('falls back to app.kubernetes.io/instance as a candidate', () => {
    assert.deepEqual(
      getArgoCDAppNameCandidates({
        metadata: {
          name: 'api-7d9f4',
          labels: {
            'app.kubernetes.io/instance': 'api-prod',
          },
        },
      }),
      ['api-prod'],
    );
  });
});

describe('findArgoCDApplicationRefForResource', () => {
  it('returns a reference only when a candidate matches an existing Application', () => {
    const ref = findArgoCDApplicationRefForResource(
      {
        metadata: {
          name: 'api-7d9f4',
          labels: {
            'app.kubernetes.io/instance': 'api-prod',
          },
        },
      },
      [
        {
          metadata: {
            name: 'api-prod',
            namespace: 'argocd',
          },
        },
      ],
    );

    assert.deepEqual(ref, {
      name: 'api-prod',
      namespace: 'argocd',
    });
  });

  it('returns null when label candidates do not exist as Applications', () => {
    const ref = findArgoCDApplicationRefForResource(
      {
        metadata: {
          name: 'api-7d9f4',
          labels: {
            'app.kubernetes.io/instance': 'api-prod',
          },
        },
      },
      [
        {
          metadata: {
            name: 'other-app',
            namespace: 'argocd',
          },
        },
      ],
    );

    assert.equal(ref, null);
  });
});

describe('buildArgoCDRefreshPatch', () => {
  it('sets the Argo CD refresh annotation', () => {
    assert.deepEqual(buildArgoCDRefreshPatch('hard'), {
      metadata: {
        annotations: {
          'argocd.argoproj.io/refresh': 'hard',
        },
      },
    });
  });
});

describe('buildArgoCDSyncPatch', () => {
  it('sets an Argo CD sync operation', () => {
    assert.deepEqual(buildArgoCDSyncPatch(), {
      operation: {
        initiatedBy: {
          username: 'kubeops',
        },
        sync: {
          syncStrategy: {
            hook: {},
          },
        },
      },
    });
  });
});

describe('getArgoCDAppSourceSummary', () => {
  it('summarizes a Helm repository source', () => {
    const summary = getArgoCDAppSourceSummary({
      metadata: { name: 'sealed-secrets' },
      spec: {
        source: {
          repoURL: 'https://bitnami-labs.github.io/sealed-secrets',
          chart: 'sealed-secrets',
          targetRevision: '1.16.1',
        },
      },
    });

    assert.deepEqual(summary, {
      type: 'Helm',
      name: 'sealed-secrets',
      revision: '1.16.1',
      repoURL: 'https://bitnami-labs.github.io/sealed-secrets',
    });
  });

  it('summarizes a git path source', () => {
    const summary = getArgoCDAppSourceSummary({
      metadata: { name: 'guestbook' },
      spec: {
        source: {
          repoURL: 'https://github.com/argoproj/argocd-example-apps.git',
          path: 'guestbook',
          targetRevision: 'HEAD',
        },
      },
    });

    assert.deepEqual(summary, {
      type: 'Git',
      name: 'guestbook',
      revision: 'HEAD',
      repoURL: 'https://github.com/argoproj/argocd-example-apps.git',
    });
  });

  it('summarizes all entries for a multi-source application', () => {
    const summary = getArgoCDAppSourceSummary({
      metadata: { name: 'api-prod' },
      spec: {
        sources: [
          {
            repoURL: 'https://charts.example.com',
            chart: 'api',
            targetRevision: '1.2.3',
          },
          {
            repoURL: 'https://github.com/example/api-values.git',
            path: 'overlays/prod',
            targetRevision: 'main',
          },
        ],
      },
    });

    assert.deepEqual(summary, {
      type: 'Multi-source',
      name: 'api, overlays/prod',
      revision: '1.2.3, main',
      repoURL: 'https://charts.example.com, https://github.com/example/api-values.git',
    });
  });
});
