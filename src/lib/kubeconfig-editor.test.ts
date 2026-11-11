import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, it } from 'node:test';
import { backup, resolveKubeconfigPath } from './kubeconfig-editor';

describe('kubeconfig path resolution', () => {
  it('falls back to the default path when KUBECONFIG is unset or empty', () => {
    assert.equal(resolveKubeconfigPath(undefined, '/home/u/.kube/config'), '/home/u/.kube/config');
    assert.equal(resolveKubeconfigPath('', '/home/u/.kube/config'), '/home/u/.kube/config');
    assert.equal(resolveKubeconfigPath(delimiter, '/home/u/.kube/config'), '/home/u/.kube/config');
  });

  it('uses the first entry of a multi-file KUBECONFIG list', () => {
    assert.equal(resolveKubeconfigPath('/a/config', '/fallback'), '/a/config');
    assert.equal(resolveKubeconfigPath(['/a/config', '/b/eks'].join(delimiter), '/fallback'), '/a/config');
    assert.equal(resolveKubeconfigPath(['', '/b/eks'].join(delimiter), '/fallback'), '/b/eks');
  });
});

describe('kubeconfig backups', () => {
  it('keeps only the newest timestamped backups', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kubeops-kubeconfig-'));
    const previous = process.env.KUBECONFIG;
    try {
      const configPath = join(dir, 'config');
      await writeFile(configPath, 'apiVersion: v1\n');
      for (let i = 0; i < 14; i += 1) {
        const stamp = `2020-01-${String(i + 1).padStart(2, '0')}T00-00-00-000Z`;
        await writeFile(`${configPath}.bak.${stamp}`, 'old\n');
      }
      process.env.KUBECONFIG = configPath;

      const created = await backup();

      const backups = (await readdir(dir)).filter((name) => name.startsWith('config.bak.')).sort();
      assert.equal(backups.length, 10);
      // The oldest ones are gone; the one just created survives.
      assert.equal(backups.includes('config.bak.2020-01-01T00-00-00-000Z'), false);
      assert.equal(backups.includes('config.bak.2020-01-14T00-00-00-000Z'), true);
      assert.equal(created.startsWith(`${configPath}.bak.`), true);
      assert.equal(backups.includes(created.slice(dir.length + 1)), true);
      // The rolling `.bak` copy is not a timestamped backup and is untouched.
      assert.equal((await readdir(dir)).includes('config.bak'), true);
    } finally {
      if (previous === undefined) delete process.env.KUBECONFIG;
      else process.env.KUBECONFIG = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
