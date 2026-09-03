#!/usr/bin/env node
// Discovers *.test.ts under src/ and runs them through tsx.
//
// Why this exists rather than `tsx --test "src/**/*.test.ts"`:
//
//   1. The glob relied on the shell. zsh expands `**`, bash does not, so the
//      suite silently did not run on CI.
//   2. Node's test runner treats `--test` positional arguments as glob
//      patterns. App Router paths contain `[param]` segments, which are glob
//      character classes, so those test files matched nothing and were skipped
//      without any error — `route.test.ts` under `[clusterId]/[appName]` had
//      never actually run.
//
// Importing the files from a generated entry module sidesteps path resolution
// entirely: `node:test` registers and runs everything the entry imports, and
// exits non-zero if any test fails.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'src';
const IGNORED = new Set(['node_modules', '.next', 'dist']);

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (entry.name.endsWith('.test.ts')) files.push(path);
  }
  return files.sort();
}

const testFiles = collect(ROOT);
if (testFiles.length === 0) {
  console.error(`No test files found under ${ROOT}${sep}`);
  process.exit(1);
}

const tempDir = mkdtempSync(join(tmpdir(), 'kubeops-tests-'));
const entry = join(tempDir, 'entry.mjs');
writeFileSync(
  entry,
  testFiles.map((file) => `import ${JSON.stringify(pathToFileURL(resolve(file)).href)};`).join('\n') + '\n',
);

const child = spawn(
  process.execPath,
  [join('node_modules', 'tsx', 'dist', 'cli.mjs'), entry, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

const cleanup = () => rmSync(tempDir, { recursive: true, force: true });

child.on('exit', (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
child.on('error', (error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});
