import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomBytes } from 'crypto';
import * as jsYaml from 'js-yaml';

const DEFAULT_KUBECONFIG_PATH = path.join(os.homedir(), '.kube', 'config');

/** Timestamped backups kept per kubeconfig file; older ones are pruned. */
export const MAX_BACKUPS = 5;

/**
 * The kubeconfig files in effect, in precedence order — `$KUBECONFIG` split on
 * the platform delimiter (`:` / `;`) like kubectl, else `~/.kube/config`.
 */
export function getKubeconfigPaths(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.KUBECONFIG;
  if (!raw) return [DEFAULT_KUBECONFIG_PATH];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const p of raw.split(path.delimiter)) {
    const trimmed = p.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    paths.push(trimmed);
  }
  return paths.length > 0 ? paths : [DEFAULT_KUBECONFIG_PATH];
}

export interface KubeconfigCluster {
  name: string;
  cluster: {
    server: string;
    'certificate-authority-data'?: string;
    'insecure-skip-tls-verify'?: boolean;
    [key: string]: unknown;
  };
}

export interface KubeconfigUser {
  name: string;
  user: {
    token?: string;
    'client-certificate-data'?: string;
    'client-key-data'?: string;
    exec?: {
      apiVersion?: string;
      command?: string;
      args?: string[];
      env?: Array<{ name: string; value: string }>;
      installHint?: string;
      provideClusterInfo?: boolean;
      interactiveMode?: string;
    };
    [key: string]: unknown;
  };
}

export interface KubeconfigContext {
  name: string;
  context: {
    cluster: string;
    user: string;
    namespace?: string;
    [key: string]: unknown;
  };
}

export interface Kubeconfig {
  apiVersion: string;
  kind: string;
  'current-context'?: string;
  clusters: KubeconfigCluster[];
  users: KubeconfigUser[];
  contexts: KubeconfigContext[];
  preferences?: Record<string, unknown>;
  /** Any other top-level keys (e.g. `extensions`), preserved on write. */
  [key: string]: unknown;
}

type Section = 'clusters' | 'users' | 'contexts';
type NamedEntry = { name: string };

// ---------------------------------------------------------------------------
// Serialisation: every read-modify-write runs under one in-process lock, so two
// concurrent requests (e.g. switch context + add context) can't each read the
// old file and have the second write drop the first's change.
// ---------------------------------------------------------------------------

let lockTail: Promise<unknown> = Promise.resolve();

export function withKubeconfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lockTail.then(fn, fn);
  // Keep the chain alive even when `fn` rejects.
  lockTail = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Multi-file load / save
// ---------------------------------------------------------------------------

interface LoadedFile {
  /** Path as listed in KUBECONFIG. */
  path: string;
  exists: boolean;
  /** Raw parsed document; unknown keys are kept so a write round-trips them. */
  doc: Record<string, unknown>;
  dirty: boolean;
}

function asEntries<T extends NamedEntry>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((e): e is T => !!e && typeof e === 'object' && typeof (e as NamedEntry).name === 'string')
    : [];
}

function isNamed(value: unknown, name: string): boolean {
  return !!value && typeof value === 'object' && (value as NamedEntry).name === name;
}

function parseDoc(content: string, where: string): Record<string, unknown> {
  let loaded: unknown;
  try {
    loaded = jsYaml.load(content);
  } catch (err) {
    throw new Error(`Invalid kubeconfig YAML in ${path.basename(where)}: ${(err as Error).message}`);
  }
  if (loaded === null || loaded === undefined) return {};
  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    throw new Error(`Kubeconfig ${path.basename(where)} is not a YAML mapping`);
  }
  return loaded as Record<string, unknown>;
}

async function loadFiles(): Promise<LoadedFile[]> {
  const files: LoadedFile[] = [];
  for (const p of getKubeconfigPaths()) {
    try {
      const content = await fs.readFile(p, 'utf-8');
      files.push({ path: p, exists: true, doc: parseDoc(content, p), dirty: false });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      // Missing files are skipped, as kubectl does.
      files.push({ path: p, exists: false, doc: {}, dirty: false });
    }
  }
  return files;
}

/**
 * A view over every kubeconfig file. Reads merge like kubectl (the first file
 * that defines a name wins); writes go to the file that owns the entry, and
 * new entries go to the first file that exists (or the first listed file when
 * none exist yet).
 */
class KubeconfigSet {
  constructor(private files: LoadedFile[]) {}

  private section<T extends NamedEntry>(file: LoadedFile, section: Section): T[] {
    return asEntries<T>(file.doc[section]);
  }

  /** The section as stored, malformed items included, so writes don't drop them. */
  private rawSection(file: LoadedFile, section: Section): unknown[] {
    const value = file.doc[section];
    return Array.isArray(value) ? [...value] : [];
  }

  private primaryFile(): LoadedFile {
    return this.files.find((f) => f.exists) || this.files[0];
  }

  private owner(section: Section, name: string): LoadedFile | undefined {
    return this.files.find((f) => this.section(f, section).some((e) => e.name === name));
  }

  merged(): Kubeconfig {
    const pick = <T extends NamedEntry>(section: Section): T[] => {
      const seen = new Set<string>();
      const out: T[] = [];
      for (const file of this.files) {
        for (const entry of this.section<T>(file, section)) {
          if (seen.has(entry.name)) continue;
          seen.add(entry.name);
          out.push(entry);
        }
      }
      return out;
    };
    const first = this.primaryFile()?.doc || {};
    const currentContext = this.files
      .map((f) => f.doc['current-context'])
      .find((v): v is string => typeof v === 'string' && v.length > 0);
    const preferences = this.files
      .map((f) => f.doc.preferences)
      .find((v) => v && typeof v === 'object') as Record<string, unknown> | undefined;
    return {
      ...first,
      apiVersion: (first.apiVersion as string) || 'v1',
      kind: (first.kind as string) || 'Config',
      'current-context': currentContext,
      clusters: pick<KubeconfigCluster>('clusters'),
      users: pick<KubeconfigUser>('users'),
      contexts: pick<KubeconfigContext>('contexts'),
      preferences: preferences || {},
    };
  }

  /** Replaces the entry in the file that owns it, or adds it to the primary file. */
  upsert(section: Section, entry: NamedEntry): void {
    const file = this.owner(section, entry.name) || this.primaryFile();
    const list = this.rawSection(file, section);
    const idx = list.findIndex((e) => isNamed(e, entry.name));
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    file.doc[section] = list;
    file.dirty = true;
  }

  /** Removes the entry from every file, so a shadowed duplicate can't resurface. */
  remove(section: Section, name: string): boolean {
    let removed = false;
    for (const file of this.files) {
      const list = this.rawSection(file, section);
      const kept = list.filter((e) => !isNamed(e, name));
      if (kept.length !== list.length) {
        file.doc[section] = kept;
        file.dirty = true;
        removed = true;
      }
    }
    return removed;
  }

  setCurrentContext(name: string | undefined): void {
    const file = this.files.find((f) => typeof f.doc['current-context'] === 'string' && f.doc['current-context'])
      || this.primaryFile();
    if (name === undefined) delete file.doc['current-context'];
    else file.doc['current-context'] = name;
    file.dirty = true;
  }

  async save(): Promise<void> {
    for (const file of this.files) {
      if (!file.dirty) continue;
      const doc = file.doc;
      if (!doc.apiVersion) doc.apiVersion = 'v1';
      if (!doc.kind) doc.kind = 'Config';
      await writeFileAtomic(file.path, jsYaml.dump(doc, { lineWidth: -1, noRefs: true }), file.exists);
      file.dirty = false;
      file.exists = true;
    }
  }
}

/** Follows symlinks (e.g. a dotfiles-managed ~/.kube/config) so we replace the target, not the link. */
async function resolveWriteTarget(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // Dangling symlink: write where it points.
    try {
      const link = await fs.readlink(p);
      return path.resolve(path.dirname(p), link);
    } catch {
      return p;
    }
  }
}

/** Removes all but the newest `keep` `<file>.bak.<timestamp>` backups. */
export async function pruneBackups(filePath: string, keep = MAX_BACKUPS): Promise<void> {
  const dir = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.bak.`;
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  // ISO timestamps (with ':' and '.' replaced) sort chronologically as strings.
  const backups = names.filter((n) => n.startsWith(prefix)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    try { await fs.unlink(path.join(dir, old)); } catch { /* ignore */ }
  }
}

async function backupFile(target: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampedPath = `${target}.bak.${timestamp}`;
  await fs.copyFile(target, timestampedPath);
  // Also maintain the .bak file as the latest backup for easy recovery
  await fs.copyFile(target, `${target}.bak`);
  await pruneBackups(target);
  return timestampedPath;
}

/**
 * Backs up, then writes via a uniquely named temp file + rename so a crash
 * can't leave a half-written kubeconfig and two writers can't share a temp
 * file. Preserves the file's permission bits (kubeconfig is usually 0600).
 */
async function writeFileAtomic(listedPath: string, content: string, exists: boolean): Promise<void> {
  const target = await resolveWriteTarget(listedPath);
  let mode = 0o600;
  if (exists) {
    try {
      mode = (await fs.stat(target)).mode & 0o777;
      await backupFile(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  }

  const tmpPath = `${target}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await fs.writeFile(tmpPath, content, { encoding: 'utf-8', mode });
    await fs.rename(tmpPath, target);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

async function loadSet(): Promise<KubeconfigSet> {
  return new KubeconfigSet(await loadFiles());
}

/** Read-modify-write under the lock. */
function mutate<T>(fn: (set: KubeconfigSet) => T | Promise<T>): Promise<T> {
  return withKubeconfigLock(async () => {
    const set = await loadSet();
    const result = await fn(set);
    await set.save();
    return result;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a timestamped backup of the primary kubeconfig file (and refresh the
 * rolling `.bak`). Writes back up every file they touch automatically.
 */
export async function backup(): Promise<string> {
  const files = await loadFiles();
  const primary = files.find((f) => f.exists) || files[0];
  return backupFile(await resolveWriteTarget(primary.path));
}

/** Read every kubeconfig file and merge them the way kubectl does. */
export async function readKubeconfig(): Promise<Kubeconfig> {
  return (await loadSet()).merged();
}

/**
 * Read the raw kubeconfig YAML. With several files in KUBECONFIG, each one
 * is included as its own YAML document.
 */
export async function readKubeconfigRaw(): Promise<string> {
  const files = (await loadFiles()).filter((f) => f.exists);
  if (files.length <= 1) {
    const p = files[0]?.path || getKubeconfigPaths()[0];
    return fs.readFile(p, 'utf-8');
  }
  const parts: string[] = [];
  for (const file of files) {
    const content = await fs.readFile(file.path, 'utf-8');
    parts.push(`# Source: ${file.path}\n${content.trimEnd()}\n`);
  }
  return parts.join('---\n');
}

/**
 * Replace the whole (merged) kubeconfig. Entries are written back to the file
 * that owns them; entries absent from `config` are removed.
 */
export async function writeKubeconfig(config: Kubeconfig): Promise<void> {
  await mutate((set) => {
    const current = set.merged();
    for (const section of ['clusters', 'users', 'contexts'] as const) {
      const wanted = new Set((config[section] as NamedEntry[]).map((e) => e.name));
      for (const entry of current[section] as NamedEntry[]) {
        if (!wanted.has(entry.name)) set.remove(section, entry.name);
      }
      for (const entry of config[section] as NamedEntry[]) set.upsert(section, entry);
    }
    if (config['current-context'] !== current['current-context']) {
      set.setCurrentContext(config['current-context']);
    }
  });
}

/**
 * List all contexts in the kubeconfig.
 */
export async function listContexts(): Promise<Array<{
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
}>> {
  const config = await readKubeconfig();
  return config.contexts.map((ctx) => ({
    name: ctx.name,
    cluster: ctx.context?.cluster,
    user: ctx.context?.user,
    namespace: ctx.context?.namespace,
    isCurrent: config['current-context'] === ctx.name,
  }));
}

/**
 * Add a new context (and optionally cluster/user entries).
 */
export async function addContext(params: {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  server?: string;
  certificateAuthorityData?: string;
  token?: string;
  clientCertificateData?: string;
  clientKeyData?: string;
}): Promise<void> {
  await mutate((set) => {
    const config = set.merged();

    // Check for duplicate context name
    if (config.contexts.some((c) => c.name === params.name)) {
      throw new Error(`Context "${params.name}" already exists`);
    }

    // Add cluster if server is provided and cluster doesn't exist
    if (params.server && !config.clusters.some((c) => c.name === params.cluster)) {
      const clusterEntry: KubeconfigCluster = {
        name: params.cluster,
        cluster: { server: params.server },
      };
      if (params.certificateAuthorityData) {
        clusterEntry.cluster['certificate-authority-data'] = params.certificateAuthorityData;
      }
      set.upsert('clusters', clusterEntry);
    }

    // Add user if auth info is provided and user doesn't exist
    if (!config.users.some((u) => u.name === params.user)) {
      const userEntry: KubeconfigUser = { name: params.user, user: {} };
      if (params.token) userEntry.user.token = params.token;
      if (params.clientCertificateData) userEntry.user['client-certificate-data'] = params.clientCertificateData;
      if (params.clientKeyData) userEntry.user['client-key-data'] = params.clientKeyData;
      set.upsert('users', userEntry);
    }

    const context: KubeconfigContext['context'] = { cluster: params.cluster, user: params.user };
    if (params.namespace) context.namespace = params.namespace;
    set.upsert('contexts', { name: params.name, context } as KubeconfigContext);
  });
}

/**
 * Update an existing context.
 */
export async function updateContext(
  name: string,
  updates: {
    cluster?: string;
    user?: string;
    namespace?: string;
  }
): Promise<void> {
  await mutate((set) => {
    const existing = set.merged().contexts.find((c) => c.name === name);
    if (!existing) {
      throw new Error(`Context "${name}" not found`);
    }
    const next: KubeconfigContext = { ...existing, context: { ...existing.context } };
    if (updates.cluster !== undefined) next.context.cluster = updates.cluster;
    if (updates.user !== undefined) next.context.user = updates.user;
    if (updates.namespace !== undefined) {
      if (updates.namespace) next.context.namespace = updates.namespace;
      else delete next.context.namespace;
    }
    set.upsert('contexts', next);
  });
}

/**
 * Delete a context from the kubeconfig.
 */
export async function deleteContext(name: string): Promise<void> {
  await mutate((set) => {
    const config = set.merged();
    if (!config.contexts.some((c) => c.name === name)) {
      throw new Error(`Context "${name}" not found`);
    }
    set.remove('contexts', name);

    // Move current-context off the deleted one
    if (config['current-context'] === name) {
      const remaining = set.merged().contexts;
      set.setCurrentContext(remaining.length > 0 ? remaining[0].name : undefined);
    }
  });
}

/**
 * Set the current context.
 */
export async function setCurrentContext(name: string): Promise<void> {
  await mutate((set) => {
    if (!set.merged().contexts.some((c) => c.name === name)) {
      throw new Error(`Context "${name}" not found`);
    }
    set.setCurrentContext(name);
  });
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface MergeRename {
  kind: 'cluster' | 'user';
  from: string;
  to: string;
}

export interface MergeResult {
  added: string[];
  skipped: string[];
  overwritten: string[];
  /**
   * Incoming clusters/users whose name was taken by a *different* existing
   * entry. They were added under a new name and the incoming contexts were
   * pointed at it, so no context silently uses the old cluster/credentials.
   */
  renamed: MergeRename[];
}

export interface MergeConflicts {
  /** Context names that already exist. */
  contexts: string[];
  /** Cluster names that exist with different content. */
  clusters: string[];
  /** User names that exist with different content. */
  users: string[];
}

export interface MergePlan {
  result: MergeResult;
  conflicts: MergeConflicts;
  incoming: { clusters: number; users: number; contexts: number };
  upserts: Array<{ section: Section; entry: NamedEntry }>;
}

/** Key-order-insensitive JSON, for "same name, same content?" checks. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function parseExternalKubeconfig(externalYaml: string): Kubeconfig {
  let external: unknown;
  try {
    external = jsYaml.load(externalYaml);
  } catch (err) {
    throw new Error(`Invalid kubeconfig YAML: ${(err as Error).message}`);
  }
  if (!external || typeof external !== 'object' || Array.isArray(external)) {
    throw new Error('Invalid kubeconfig YAML');
  }
  const doc = external as Record<string, unknown>;
  return {
    apiVersion: (doc.apiVersion as string) || 'v1',
    kind: (doc.kind as string) || 'Config',
    clusters: asEntries<KubeconfigCluster>(doc.clusters),
    users: asEntries<KubeconfigUser>(doc.users),
    contexts: asEntries<KubeconfigContext>(doc.contexts),
  };
}

/**
 * Works out what a merge would do, without touching disk.
 *
 * - Identical clusters/users are reused.
 * - A cluster/user whose name exists with different content is overwritten
 *   ("overwrite") or added as `<name>-2`, `<name>-3`, … ("skip"), with the
 *   incoming contexts rewritten to reference the new name.
 * - Existing context names are overwritten or skipped per strategy.
 */
export function planMerge(current: Kubeconfig, external: Kubeconfig, strategy: 'skip' | 'overwrite'): MergePlan {
  const result: MergeResult = { added: [], skipped: [], overwritten: [], renamed: [] };
  const conflicts: MergeConflicts = { contexts: [], clusters: [], users: [] };
  const upserts: MergePlan['upserts'] = [];

  const contextNames = new Set(current.contexts.map((c) => c.name));

  // Decide which incoming contexts will be written, so renamed copies are only
  // added when something actually references them.
  const writtenContexts = external.contexts.filter((ctx) => {
    if (!contextNames.has(ctx.name)) return true;
    conflicts.contexts.push(ctx.name);
    return strategy === 'overwrite';
  });
  const referenced = {
    cluster: new Set(writtenContexts.map((c) => c.context?.cluster)),
    user: new Set(writtenContexts.map((c) => c.context?.user)),
  };

  const mergeSection = (
    section: 'clusters' | 'users',
    kind: 'cluster' | 'user',
  ): Map<string, string> => {
    const renames = new Map<string, string>();
    const existing = new Map((current[section] as NamedEntry[]).map((e) => [e.name, e]));
    const taken = new Set<string>([...existing.keys(), ...(external[section] as NamedEntry[]).map((e) => e.name)]);

    for (const entry of external[section] as NamedEntry[]) {
      const prior = existing.get(entry.name);
      if (!prior) {
        upserts.push({ section, entry });
        result.added.push(`${kind}/${entry.name}`);
        continue;
      }
      if (sameContent(prior, entry)) {
        result.skipped.push(`${kind}/${entry.name}`);
        continue;
      }
      conflicts[section].push(entry.name);
      if (strategy === 'overwrite') {
        upserts.push({ section, entry });
        result.overwritten.push(`${kind}/${entry.name}`);
        continue;
      }
      if (!referenced[kind].has(entry.name)) {
        // Nothing being merged points at it; keep the existing one.
        result.skipped.push(`${kind}/${entry.name}`);
        continue;
      }
      let n = 2;
      while (taken.has(`${entry.name}-${n}`)) n++;
      const to = `${entry.name}-${n}`;
      taken.add(to);
      renames.set(entry.name, to);
      upserts.push({ section, entry: { ...entry, name: to } });
      result.renamed.push({ kind, from: entry.name, to });
      result.added.push(`${kind}/${to}`);
    }
    return renames;
  };

  const clusterRenames = mergeSection('clusters', 'cluster');
  const userRenames = mergeSection('users', 'user');

  for (const ctx of external.contexts) {
    const exists = contextNames.has(ctx.name);
    if (exists && strategy !== 'overwrite') {
      result.skipped.push(`context/${ctx.name}`);
      continue;
    }
    const inner = { ...(ctx.context || {}) } as KubeconfigContext['context'];
    if (inner.cluster && clusterRenames.has(inner.cluster)) inner.cluster = clusterRenames.get(inner.cluster)!;
    if (inner.user && userRenames.has(inner.user)) inner.user = userRenames.get(inner.user)!;
    upserts.push({ section: 'contexts', entry: { ...ctx, context: inner } as KubeconfigContext });
    (exists ? result.overwritten : result.added).push(`context/${ctx.name}`);
  }

  return {
    result,
    conflicts,
    incoming: {
      clusters: external.clusters.length,
      users: external.users.length,
      contexts: external.contexts.length,
    },
    upserts,
  };
}

/** Shows what merging `externalYaml` would do, without writing anything. */
export async function previewMerge(
  externalYaml: string,
  strategy: 'skip' | 'overwrite' = 'skip',
): Promise<Omit<MergePlan, 'upserts'>> {
  const external = parseExternalKubeconfig(externalYaml);
  const plan = planMerge(await readKubeconfig(), external, strategy);
  return { result: plan.result, conflicts: plan.conflicts, incoming: plan.incoming };
}

/**
 * Merge an external kubeconfig into the current one.
 */
export async function mergeKubeconfig(
  externalYaml: string,
  strategy: 'skip' | 'overwrite' = 'skip'
): Promise<MergeResult> {
  const external = parseExternalKubeconfig(externalYaml);
  return mutate((set) => {
    const plan = planMerge(set.merged(), external, strategy);
    for (const { section, entry } of plan.upserts) set.upsert(section, entry);
    return plan.result;
  });
}
