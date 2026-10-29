import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as jsYaml from 'js-yaml';
import {
  addContext,
  deleteContext,
  getKubeconfigPaths,
  listContexts,
  mergeKubeconfig,
  planMerge,
  previewMerge,
  pruneBackups,
  readKubeconfig,
  setCurrentContext,
  updateContext,
  MAX_BACKUPS,
  type Kubeconfig,
} from './kubeconfig-editor';

function config(partial: Partial<Kubeconfig> & Record<string, unknown>): string {
  return jsYaml.dump({ apiVersion: 'v1', kind: 'Config', clusters: [], users: [], contexts: [], ...partial });
}

async function readYaml(p: string): Promise<Record<string, unknown>> {
  return jsYaml.load(await fs.readFile(p, 'utf-8')) as Record<string, unknown>;
}

const cluster = (name: string, server: string) => ({ name, cluster: { server } });
const user = (name: string, token: string) => ({ name, user: { token } });
const context = (name: string, c: string, u: string) => ({ name, context: { cluster: c, user: u } });

describe('kubeconfig-editor', () => {
  let dir: string;
  let fileA: string;
  let fileB: string;
  const originalEnv = process.env.KUBECONFIG;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kubeops-kubeconfig-test-'));
  });

  after(async () => {
    if (originalEnv === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = originalEnv;
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const sub = await fs.mkdtemp(path.join(dir, 'case-'));
    fileA = path.join(sub, 'a.yaml');
    fileB = path.join(sub, 'b.yaml');
    process.env.KUBECONFIG = fileA;
  });

  it('splits KUBECONFIG on the platform delimiter and drops empties and duplicates', () => {
    const env = { KUBECONFIG: ['/x/a', '', '/x/b', '/x/a'].join(path.delimiter) };
    assert.deepEqual(getKubeconfigPaths(env), ['/x/a', '/x/b']);
  });

  it('merges multiple files like kubectl (first definition wins) and writes to the owning file', async () => {
    await fs.writeFile(fileA, config({ clusters: [cluster('c1', 'https://a')], users: [user('u1', 'a')], contexts: [context('ctx-a', 'c1', 'u1')] }));
    await fs.writeFile(fileB, config({
      'current-context': 'ctx-b',
      clusters: [cluster('c1', 'https://shadowed'), cluster('c2', 'https://b')],
      users: [user('u2', 'b')],
      contexts: [context('ctx-b', 'c2', 'u2')],
    }));
    process.env.KUBECONFIG = [fileA, fileB].join(path.delimiter);

    const merged = await readKubeconfig();
    assert.equal(merged.clusters.find((c) => c.name === 'c1')?.cluster.server, 'https://a');
    assert.deepEqual(merged.contexts.map((c) => c.name).sort(), ['ctx-a', 'ctx-b']);
    assert.equal(merged['current-context'], 'ctx-b');

    await updateContext('ctx-b', { namespace: 'team' });
    const b = await readYaml(fileB);
    assert.equal((b.contexts as Array<{ name: string; context: { namespace?: string } }>)
      .find((c) => c.name === 'ctx-b')?.context.namespace, 'team');
    const a = await readYaml(fileA);
    assert.equal((a.contexts as unknown[]).length, 1, 'ctx-b must not be copied into the first file');

    // current-context lives in file B, so switching updates B.
    await setCurrentContext('ctx-a');
    assert.equal((await readYaml(fileB))['current-context'], 'ctx-a');

    // New entries go to the first file.
    await addContext({ name: 'ctx-new', cluster: 'c1', user: 'u1' });
    const aAfter = await readYaml(fileA);
    assert.ok((aAfter.contexts as Array<{ name: string }>).some((c) => c.name === 'ctx-new'));
  });

  it('preserves unknown top-level keys and entry fields on round-trip', async () => {
    await fs.writeFile(fileA, config({
      extensions: [{ name: 'my-ext', extension: { foo: 'bar' } }],
      clusters: [{ name: 'c1', cluster: { server: 'https://a', 'proxy-url': 'http://proxy' } }],
      users: [user('u1', 't')],
      contexts: [context('ctx', 'c1', 'u1')],
    }));
    await setCurrentContext('ctx');
    const doc = await readYaml(fileA);
    assert.deepEqual(doc.extensions, [{ name: 'my-ext', extension: { foo: 'bar' } }]);
    assert.equal((doc.clusters as Array<{ cluster: Record<string, string> }>)[0].cluster['proxy-url'], 'http://proxy');
    assert.equal(doc['current-context'], 'ctx');
  });

  it('writes through a symlink to its target instead of replacing the link', async () => {
    const target = path.join(path.dirname(fileA), 'real-config');
    await fs.writeFile(target, config({ clusters: [cluster('c1', 'https://a')], users: [user('u1', 't')], contexts: [context('ctx', 'c1', 'u1')] }));
    await fs.symlink(target, fileA);
    await setCurrentContext('ctx');
    assert.equal((await fs.lstat(fileA)).isSymbolicLink(), true);
    assert.equal((await readYaml(target))['current-context'], 'ctx');
  });

  it('serialises concurrent read-modify-write operations so none is lost', async () => {
    await fs.writeFile(fileA, config({ clusters: [cluster('c1', 'https://a')], users: [user('u1', 't')] }));
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => addContext({ name: `ctx-${i}`, cluster: 'c1', user: 'u1' })),
    );
    const names = (await listContexts()).map((c) => c.name).sort();
    assert.deepEqual(names, Array.from({ length: 8 }, (_, i) => `ctx-${i}`).sort());
    const leftovers = (await fs.readdir(path.dirname(fileA))).filter((n) => n.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  });

  it('keeps only the newest backups', async () => {
    await fs.writeFile(fileA, 'x');
    for (let i = 0; i < MAX_BACKUPS + 3; i++) {
      await fs.writeFile(`${fileA}.bak.2026-01-0${i}T00-00-00-000Z`, 'old');
    }
    await pruneBackups(fileA);
    const backups = (await fs.readdir(path.dirname(fileA))).filter((n) => n.startsWith('a.yaml.bak.')).sort();
    assert.equal(backups.length, MAX_BACKUPS);
    assert.equal(backups[backups.length - 1], `a.yaml.bak.2026-01-0${MAX_BACKUPS + 2}T00-00-00-000Z`);
  });

  it('deleting the current context moves current-context to a remaining one', async () => {
    await fs.writeFile(fileA, config({
      'current-context': 'one',
      clusters: [cluster('c1', 'https://a')],
      users: [user('u1', 't')],
      contexts: [context('one', 'c1', 'u1'), context('two', 'c1', 'u1')],
    }));
    await deleteContext('one');
    const merged = await readKubeconfig();
    assert.deepEqual(merged.contexts.map((c) => c.name), ['two']);
    assert.equal(merged['current-context'], 'two');
  });

  describe('merge', () => {
    const existing = (): Kubeconfig => ({
      apiVersion: 'v1',
      kind: 'Config',
      clusters: [cluster('prod', 'https://old')],
      users: [user('admin', 'old-token')],
      contexts: [context('prod', 'prod', 'admin')],
    } as Kubeconfig);

    const incoming = (): Kubeconfig => ({
      apiVersion: 'v1',
      kind: 'Config',
      clusters: [cluster('prod', 'https://new')],
      users: [user('admin', 'new-token')],
      contexts: [context('prod-new', 'prod', 'admin')],
    } as Kubeconfig);

    it('renames a conflicting cluster/user under "skip" and points the new context at the renamed copy', () => {
      const plan = planMerge(existing(), incoming(), 'skip');
      assert.deepEqual(plan.conflicts, { contexts: [], clusters: ['prod'], users: ['admin'] });
      assert.deepEqual(plan.result.renamed, [
        { kind: 'cluster', from: 'prod', to: 'prod-2' },
        { kind: 'user', from: 'admin', to: 'admin-2' },
      ]);
      const ctx = plan.upserts.find((u) => u.section === 'contexts')?.entry as unknown as { context: { cluster: string; user: string } };
      assert.deepEqual(ctx.context, { cluster: 'prod-2', user: 'admin-2' });
    });

    it('reuses identical clusters/users without reporting a conflict', () => {
      const ext = incoming();
      ext.clusters = [cluster('prod', 'https://old')];
      ext.users = [user('admin', 'old-token')];
      const plan = planMerge(existing(), ext, 'skip');
      assert.deepEqual(plan.conflicts, { contexts: [], clusters: [], users: [] });
      assert.deepEqual(plan.result.renamed, []);
      assert.deepEqual(plan.result.added, ['context/prod-new']);
    });

    it('overwrites conflicting entries under "overwrite"', () => {
      const plan = planMerge(existing(), incoming(), 'overwrite');
      assert.deepEqual(plan.result.overwritten, ['cluster/prod', 'user/admin']);
      assert.deepEqual(plan.result.renamed, []);
    });

    it('does not add renamed copies that only a skipped context would use', () => {
      const ext = incoming();
      ext.contexts = [context('prod', 'prod', 'admin')];
      const plan = planMerge(existing(), ext, 'skip');
      assert.deepEqual(plan.conflicts.contexts, ['prod']);
      assert.deepEqual(plan.result.renamed, []);
      assert.deepEqual(plan.upserts, []);
    });

    it('picks a free suffix when <name>-2 is already taken', () => {
      const cur = existing();
      cur.clusters.push(cluster('prod-2', 'https://other'));
      const plan = planMerge(cur, incoming(), 'skip');
      assert.equal(plan.result.renamed[0].to, 'prod-3');
    });

    it('previews without writing, then merges to disk', async () => {
      const original = config({ ...existing() });
      await fs.writeFile(fileA, original);
      const yaml = jsYaml.dump(incoming());

      const preview = await previewMerge(yaml, 'skip');
      assert.deepEqual(preview.conflicts.clusters, ['prod']);
      assert.deepEqual(preview.incoming, { clusters: 1, users: 1, contexts: 1 });
      assert.equal(await fs.readFile(fileA, 'utf-8'), original);

      const result = await mergeKubeconfig(yaml, 'skip');
      assert.equal(result.renamed.length, 2);
      const merged = await readKubeconfig();
      assert.equal(merged.clusters.find((c) => c.name === 'prod')?.cluster.server, 'https://old');
      assert.equal(merged.clusters.find((c) => c.name === 'prod-2')?.cluster.server, 'https://new');
    });
  });
});
