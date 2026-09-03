import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureToolPath, isWindows, pickCliPath, type MutableEnv } from './cli-path';

describe('pickCliPath', () => {
  it('prefers an absolute path with no spaces and no Rancher Desktop shim', () => {
    const chosen = pickCliPath(
      ['/Users/me/.rd/bin/kubectl', '/opt/homebrew/bin/kubectl'],
      'kubectl',
      'darwin',
    );
    assert.equal(chosen, '/opt/homebrew/bin/kubectl');
  });

  it('falls back to a spaced path rather than giving up', () => {
    const chosen = pickCliPath(['/Applications/My Tools/kubectl'], 'kubectl', 'darwin');
    assert.equal(chosen, '/Applications/My Tools/kubectl');
  });

  it('ignores relative and blank lines from the lookup tool', () => {
    const chosen = pickCliPath(['', '  ', 'kubectl', './kubectl'], 'fallback', 'darwin');
    assert.equal(chosen, 'fallback');
  });

  it('returns the fallback when nothing matched', () => {
    assert.equal(pickCliPath([], 'helm', 'darwin'), 'helm');
  });

  it('recognizes Windows paths from `where` output', () => {
    const chosen = pickCliPath(['C:\\tools\\kubectl.exe  '], 'kubectl', 'win32');
    assert.equal(chosen, 'C:\\tools\\kubectl.exe');
  });

  it('does not treat a Windows path as absolute on posix', () => {
    assert.equal(pickCliPath(['C:\\tools\\kubectl.exe'], 'kubectl', 'darwin'), 'kubectl');
  });
});

describe('isWindows', () => {
  it('recognizes win32 only', () => {
    assert.equal(isWindows('win32'), true);
    assert.equal(isWindows('darwin'), false);
    assert.equal(isWindows('linux'), false);
  });
});

describe('ensureToolPath', () => {
  it('adds the GUI-missing tool directories on posix', () => {
    const env: MutableEnv = { PATH: '/usr/bin' };
    ensureToolPath(env, 'darwin');
    assert.ok(env.PATH?.includes('/opt/homebrew/bin'));
    assert.ok(env.PATH?.includes('/usr/local/bin'));
  });

  it('does not duplicate directories that are already present', () => {
    const env: MutableEnv = { PATH: '/opt/homebrew/bin:/usr/bin' };
    ensureToolPath(env, 'darwin');
    const occurrences = env.PATH!.split(':').filter((p) => p === '/opt/homebrew/bin').length;
    assert.equal(occurrences, 1);
  });

  it('leaves Windows PATH untouched — those directories do not exist there', () => {
    const env: MutableEnv = { PATH: 'C:\\Windows\\System32' };
    ensureToolPath(env, 'win32');
    assert.equal(env.PATH, 'C:\\Windows\\System32');
  });
});
