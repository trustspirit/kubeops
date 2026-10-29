import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyHelmError, exactReleaseFilter, isReleaseNotFound, HELM_TIMEOUT_EXIT_CODE } from './errors';

describe('classifyHelmError', () => {
  it('maps a missing release to 404', () => {
    assert.equal(classifyHelmError('Error: release: not found', 1, 'x').status, 404);
  });

  it('maps a held release lock and a taken name to 409', () => {
    assert.equal(
      classifyHelmError('Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress', 1, 'x').status,
      409,
    );
    assert.equal(
      classifyHelmError('Error: INSTALLATION FAILED: cannot re-use a name that is still in use', 1, 'x').status,
      409,
    );
  });

  it('maps our own timeout to 504', () => {
    assert.equal(classifyHelmError('Helm did not finish in time', HELM_TIMEOUT_EXIT_CODE, 'x').status, 504);
  });

  it('defaults to 500 and falls back when stderr is empty', () => {
    assert.deepEqual(classifyHelmError('', 1, 'Failed to list'), { status: 500, message: 'Failed to list' });
  });

  it('redacts local paths from the message', () => {
    const { message } = classifyHelmError('Error: open /Users/alice/.cache/helm/repo/x.yaml: permission denied', 1, 'x');
    assert.ok(!message.includes('/Users/alice'), message);
  });
});

describe('isReleaseNotFound', () => {
  it('recognises helm\'s "release: not found"', () => {
    assert.equal(isReleaseNotFound('Error: uninstall: Release not loaded: api: release: not found'), true);
    assert.equal(isReleaseNotFound('Error: chart "x" not found in repo'), false);
  });
});

describe('exactReleaseFilter', () => {
  it('anchors and escapes regex metacharacters', () => {
    assert.equal(exactReleaseFilter('my.app'), '^my\\.app$');
    assert.ok(new RegExp(exactReleaseFilter('my.app')).test('my.app'));
    assert.ok(!new RegExp(exactReleaseFilter('my.app')).test('myXapp'));
    assert.ok(!new RegExp(exactReleaseFilter('api')).test('api-worker'));
  });
});
