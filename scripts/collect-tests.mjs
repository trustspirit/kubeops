import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const TEST_ROOT = 'src';
export const TEST_SUFFIX = '.test.ts';

const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist']);

/**
 * Every test file under `root`, sorted.
 *
 * Kept separate from the runner so a test can assert that nothing is being
 * skipped: `route.test.ts` files live under App Router `[param]` directories,
 * which node's test runner silently treats as glob character classes.
 */
export function collectTestFiles(root = TEST_ROOT) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectTestFiles(path));
    else if (entry.name.endsWith(TEST_SUFFIX)) files.push(path);
  }
  return files.sort();
}
