import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { collectTestFiles, TEST_SUFFIX } from '../../scripts/collect-tests.mjs';

/**
 * Guards against tests disappearing from the suite without anyone noticing.
 *
 * The ArgoCD route test lived under `[clusterId]/[appName]` and never ran:
 * node's test runner reads `--test` arguments as glob patterns, and those
 * brackets are character classes, so the path matched nothing — and matching
 * nothing is not an error.
 */
describe('test discovery', () => {
  const discovered: string[] = collectTestFiles();

  /** Every test file in the working tree, tracked or not, per git. */
  function testFilesInWorkingTree(): string[] {
    return execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src'],
      { encoding: 'utf-8' },
    )
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith(TEST_SUFFIX))
      .sort();
  }

  it('finds every test file in the working tree', () => {
    // Normalise separators so this also holds on Windows checkouts.
    const normalized = discovered.map((file) => file.split('\\').join('/')).sort();
    assert.deepEqual(normalized, testFilesInWorkingTree());
  });

  it('includes test files inside App Router [param] directories', () => {
    const bracketed = discovered.filter((file) => file.includes('['));
    assert.ok(
      bracketed.length > 0,
      'expected at least one test under a dynamic route segment; if these were moved, drop this assertion',
    );
  });

  it('finds a plausible number of suites, not zero', () => {
    assert.ok(discovered.length > 20, `only found ${discovered.length} test files`);
  });
});
