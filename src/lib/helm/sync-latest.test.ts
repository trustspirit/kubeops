import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHelmSyncLatestArgs,
  findHelmReleaseRef,
  isSameChartVersion,
  parseHelmListChart,
  selectLatestChartSearchResult,
} from './sync-latest';

describe('findHelmReleaseRef', () => {
  it('uses Helm release annotations before labels', () => {
    const ref = findHelmReleaseRef({
      metadata: {
        name: 'api-7d9f4',
        namespace: 'workloads',
        labels: {
          'app.kubernetes.io/instance': 'label-release',
        },
        annotations: {
          'meta.helm.sh/release-name': 'annotated-release',
          'meta.helm.sh/release-namespace': 'helm-ns',
        },
      },
    });

    assert.deepEqual(ref, {
      name: 'annotated-release',
      namespace: 'helm-ns',
    });
  });

  it('falls back to common Helm labels and resource namespace', () => {
    const ref = findHelmReleaseRef({
      metadata: {
        name: 'api-7d9f4',
        namespace: 'workloads',
        labels: {
          'app.kubernetes.io/managed-by': 'Helm',
          'app.kubernetes.io/instance': 'label-release',
        },
      },
    });

    assert.deepEqual(ref, {
      name: 'label-release',
      namespace: 'workloads',
    });
  });

  it('checks owner resources when the pod has no Helm metadata', () => {
    const ref = findHelmReleaseRef(
      {
        metadata: {
          name: 'api-7d9f4',
          namespace: 'workloads',
        },
      },
      [
        {
          metadata: {
            name: 'api',
            namespace: 'workloads',
            annotations: {
              'meta.helm.sh/release-name': 'api-release',
            },
          },
        },
      ],
    );

    assert.deepEqual(ref, {
      name: 'api-release',
      namespace: 'workloads',
    });
  });
});

describe('buildHelmSyncLatestArgs', () => {
  it('builds a latest chart upgrade with existing values and dependency updates', () => {
    const args = buildHelmSyncLatestArgs({
      releaseName: 'api',
      chart: 'platform/api',
      namespace: 'workloads',
    });

    assert.deepEqual(args, [
      'upgrade',
      'api',
      'platform/api',
      '-n',
      'workloads',
      '--output',
      'json',
      '--reuse-values',
      '--dependency-update',
    ]);
  });

  it('can append an explicit chart version when provided', () => {
    const args = buildHelmSyncLatestArgs({
      releaseName: 'api',
      chart: 'platform/api',
      namespace: 'workloads',
      version: '1.2.3',
    });

    assert.deepEqual(args.slice(-2), ['--version', '1.2.3']);
  });
});

describe('selectLatestChartSearchResult', () => {
  it('prefers an exact chart reference match', () => {
    const result = selectLatestChartSearchResult('platform/api', [
      { name: 'platform/api-worker', version: '9.9.9', app_version: '9', description: '' },
      { name: 'platform/api', version: '1.2.3', app_version: '1', description: '' },
    ]);

    assert.deepEqual(result, {
      name: 'platform/api',
      version: '1.2.3',
      app_version: '1',
      description: '',
    });
  });

  it('can infer a unique basename match when no repository prefix is known', () => {
    const result = selectLatestChartSearchResult('api', [
      { name: 'platform/api-worker', version: '9.9.9', app_version: '9', description: '' },
      { name: 'platform/api', version: '1.2.3', app_version: '1', description: '' },
    ]);

    assert.equal(result?.name, 'platform/api');
  });

  it('returns null for ambiguous basename matches', () => {
    const result = selectLatestChartSearchResult('api', [
      { name: 'platform/api', version: '1.2.3', app_version: '1', description: '' },
      { name: 'shared/api', version: '2.0.0', app_version: '2', description: '' },
    ]);

    assert.equal(result, null);
  });
});

describe('parseHelmListChart', () => {
  it('splits a Helm list chart field into chart name and semantic version', () => {
    assert.deepEqual(parseHelmListChart('my-api-service-1.2.3'), {
      name: 'my-api-service',
      version: '1.2.3',
    });
  });

  it('keeps the original name when there is no trailing semantic version', () => {
    assert.deepEqual(parseHelmListChart('my-api-service'), {
      name: 'my-api-service',
      version: undefined,
    });
  });
});

describe('isSameChartVersion', () => {
  it('treats matching chart versions as equal', () => {
    assert.equal(isSameChartVersion('1.2.3', '1.2.3'), true);
  });

  it('ignores blank versions because Helm may omit them', () => {
    assert.equal(isSameChartVersion(undefined, '1.2.3'), false);
    assert.equal(isSameChartVersion('1.2.3', undefined), false);
  });
});
