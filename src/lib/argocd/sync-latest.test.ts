import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareSemver,
  selectLatestVersion,
  isChartUpdateAvailable,
  isTargetRevisionPinned,
  getChartSource,
  getSyncedRevision,
  getSyncStatus,
  buildAppGetArgs,
  buildAppSetRevisionArgs,
  buildAppSyncArgs,
  buildLoginArgs,
  buildUserInfoArgs,
} from './sync-latest';

describe('compareSemver', () => {
  it('orders by major, minor, patch', () => {
    assert.equal(compareSemver('1.2.3', '1.2.4') < 0, true);
    assert.equal(compareSemver('2.0.0', '1.9.9') > 0, true);
    assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  });
  it('treats a prerelease as lower than its release', () => {
    assert.equal(compareSemver('1.2.3-rc.1', '1.2.3') < 0, true);
  });
  it('compares numeric prerelease identifiers numerically', () => {
    assert.equal(compareSemver('1.2.3-rc.2', '1.2.3-rc.10') < 0, true);
  });
  it('preserves multi-hyphen prerelease versions', () => {
    assert.equal(compareSemver('1.2.3-rc-1', '1.2.3') < 0, true);
  });
});

describe('selectLatestVersion', () => {
  it('returns the highest semver', () => {
    assert.equal(selectLatestVersion(['1.2.0', '1.10.0', '1.9.0']), '1.10.0');
  });
  it('returns null for an empty list', () => {
    assert.equal(selectLatestVersion([]), null);
  });
  it('selects the numerically highest prerelease identifier', () => {
    assert.equal(selectLatestVersion(['1.2.3-rc.2', '1.2.3-rc.10']), '1.2.3-rc.10');
  });
});

describe('isChartUpdateAvailable', () => {
  it('is true when latest is strictly greater', () => {
    assert.equal(isChartUpdateAvailable('1.2.3', '1.3.0'), true);
  });
  it('is false when equal or unknown', () => {
    assert.equal(isChartUpdateAvailable('1.3.0', '1.3.0'), false);
    assert.equal(isChartUpdateAvailable(undefined, '1.3.0'), false);
    assert.equal(isChartUpdateAvailable('1.2.3', undefined), false);
  });
});

describe('isTargetRevisionPinned', () => {
  it('treats an exact semver as pinned', () => {
    assert.equal(isTargetRevisionPinned('1.2.3'), true);
    assert.equal(isTargetRevisionPinned('1.2.3-rc.1'), true);
  });
  it('treats ranges and empty as floating', () => {
    assert.equal(isTargetRevisionPinned('1.2.*'), false);
    assert.equal(isTargetRevisionPinned('>=1.0.0'), false);
    assert.equal(isTargetRevisionPinned('^1.2.0'), false);
    assert.equal(isTargetRevisionPinned(''), false);
    assert.equal(isTargetRevisionPinned(undefined), false);
  });
});

describe('getChartSource', () => {
  it('extracts chart/repoURL/targetRevision from a single helm source', () => {
    assert.deepEqual(
      getChartSource({ spec: { source: { chart: 'my-chart', repoURL: 'https://charts.example', targetRevision: '1.2.3' } } }),
      { chart: 'my-chart', repoURL: 'https://charts.example', targetRevision: '1.2.3' },
    );
  });
  it('returns null for a git source (no chart)', () => {
    assert.equal(getChartSource({ spec: { source: { repoURL: 'https://git', path: 'apps/x' } } }), null);
  });
  it('returns null for multi-source apps in v1', () => {
    assert.equal(getChartSource({ spec: { sources: [{ chart: 'a' }] } }), null);
  });
});

describe('status readers', () => {
  it('reads synced revision and sync status', () => {
    const app = { status: { sync: { revision: '1.2.3', status: 'OutOfSync' } } };
    assert.equal(getSyncedRevision(app), '1.2.3');
    assert.equal(getSyncStatus(app), 'OutOfSync');
  });
});

describe('arg builders', () => {
  it('builds app get args with refresh and server', () => {
    assert.deepEqual(
      buildAppGetArgs('web', { server: 'argocd-root.ovdr.io', refresh: true }),
      ['app', 'get', 'web', '-o', 'json', '--refresh', '--server', 'argocd-root.ovdr.io'],
    );
  });
  it('builds app get args without optionals', () => {
    assert.deepEqual(buildAppGetArgs('web'), ['app', 'get', 'web', '-o', 'json']);
  });
  it('builds set-revision and sync args', () => {
    assert.deepEqual(buildAppSetRevisionArgs('web', '1.3.0'), ['app', 'set', 'web', '--revision', '1.3.0']);
    assert.deepEqual(buildAppSyncArgs('web', { server: 's' }), ['app', 'sync', 'web', '--server', 's']);
  });
  it('builds sso login args', () => {
    assert.deepEqual(
      buildLoginArgs({ server: 'argocd-root.ovdr.io', authMode: 'sso', grpcWeb: 'true' }),
      ['login', 'argocd-root.ovdr.io', '--sso', '--grpc-web'],
    );
  });
  it('builds username/password login args', () => {
    assert.deepEqual(
      buildLoginArgs({ server: 's', authMode: 'username-password', username: 'u', password: 'p' }),
      ['login', 's', '--username', 'u', '--password', 'p'],
    );
  });
  it('builds user-info args', () => {
    assert.deepEqual(buildUserInfoArgs({ server: 's' }), ['account', 'get-user-info', '-o', 'json', '--server', 's']);
  });
});

describe('arg builder input validation', () => {
  it('rejects a flag-like app name', () => {
    assert.throws(() => buildAppGetArgs('--core'), /Invalid ArgoCD app name/);
    assert.throws(() => buildAppSyncArgs('-x'), /Invalid ArgoCD app name/);
  });
  it('rejects a flag-like or malformed server', () => {
    assert.throws(() => buildAppGetArgs('web', { server: '--evil' }), /Invalid ArgoCD server/);
    assert.throws(() => buildUserInfoArgs({ server: 'bad host!' }), /Invalid ArgoCD server/);
  });
  it('rejects a flag-like revision', () => {
    assert.throws(() => buildAppSetRevisionArgs('web', '--boom'), /Invalid ArgoCD revision/);
  });
  it('rejects a flag-like server in login args', () => {
    assert.throws(() => buildLoginArgs({ server: '-x', authMode: 'sso' }), /Invalid ArgoCD server/);
  });
  it('still accepts valid values', () => {
    assert.deepEqual(buildAppGetArgs('web', { server: 'argocd-root.ovdr.io:443', refresh: true }),
      ['app', 'get', 'web', '-o', 'json', '--refresh', '--server', 'argocd-root.ovdr.io:443']);
    assert.deepEqual(buildAppSetRevisionArgs('ns/web', '1.2.3-rc.1'),
      ['app', 'set', 'ns/web', '--revision', '1.2.3-rc.1']);
  });
});
