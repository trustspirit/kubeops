import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as jsYaml from 'js-yaml';

const KUBECONFIG_PATH = path.join(os.homedir(), '.kube', 'config');

function getKubeconfigPath(): string {
  return process.env.KUBECONFIG || KUBECONFIG_PATH;
}

export interface KubeconfigCluster {
  name: string;
  cluster: {
    server: string;
    'certificate-authority-data'?: string;
    'insecure-skip-tls-verify'?: boolean;
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
  };
}

export interface KubeconfigContext {
  name: string;
  context: {
    cluster: string;
    user: string;
    namespace?: string;
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
}

/**
 * Create a backup of the kubeconfig file.
 * Uses a timestamped backup name to prevent overwriting previous backups,
 * and maintains a rolling '.bak' symlink/copy pointing to the latest backup.
 */
export async function backup(): Promise<string> {
  const configPath = getKubeconfigPath();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampedPath = `${configPath}.bak.${timestamp}`;
  const latestPath = configPath + '.bak';
  await fs.copyFile(configPath, timestampedPath);
  // Also maintain the .bak file as the latest backup for easy recovery
  await fs.copyFile(configPath, latestPath);
  return timestampedPath;
}

/**
 * Read and parse the kubeconfig file.
 */
export async function readKubeconfig(): Promise<Kubeconfig> {
  const configPath = getKubeconfigPath();
  const content = await fs.readFile(configPath, 'utf-8');
  const config = jsYaml.load(content) as Kubeconfig;
  return {
    apiVersion: config.apiVersion || 'v1',
    kind: config.kind || 'Config',
    'current-context': config['current-context'],
    clusters: config.clusters || [],
    users: config.users || [],
    contexts: config.contexts || [],
    preferences: config.preferences || {},
  };
}

/**
 * Read the raw kubeconfig YAML content.
 */
export async function readKubeconfigRaw(): Promise<string> {
  const configPath = getKubeconfigPath();
  return await fs.readFile(configPath, 'utf-8');
}

/**
 * Write the kubeconfig file, creating a backup first.
 * Uses atomic write (write to temp file, then rename) to prevent corruption
 * if the process crashes mid-write. Also preserves file permissions.
 */
export async function writeKubeconfig(config: Kubeconfig): Promise<void> {
  await backup();
  const configPath = getKubeconfigPath();
  const yaml = jsYaml.dump(config, { lineWidth: -1, noRefs: true });

  // Atomic write: write to temp file then rename to prevent partial writes
  const tmpPath = configPath + '.tmp.' + process.pid;
  try {
    // Try to preserve original file permissions (kubeconfig is typically 0600)
    let mode: number | undefined;
    try {
      const stat = await fs.stat(configPath);
      mode = stat.mode;
    } catch {
      // File might not exist yet
    }

    await fs.writeFile(tmpPath, yaml, { encoding: 'utf-8', mode: mode ?? 0o600 });
    await fs.rename(tmpPath, configPath);
  } catch (err) {
    // Clean up temp file on failure
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
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
    cluster: ctx.context.cluster,
    user: ctx.context.user,
    namespace: ctx.context.namespace,
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
  const config = await readKubeconfig();

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
    config.clusters.push(clusterEntry);
  }

  // Add user if auth info is provided and user doesn't exist
  if (!config.users.some((u) => u.name === params.user)) {
    const userEntry: KubeconfigUser = { name: params.user, user: {} };
    if (params.token) userEntry.user.token = params.token;
    if (params.clientCertificateData) userEntry.user['client-certificate-data'] = params.clientCertificateData;
    if (params.clientKeyData) userEntry.user['client-key-data'] = params.clientKeyData;
    config.users.push(userEntry);
  }

  // Add context
  config.contexts.push({
    name: params.name,
    context: {
      cluster: params.cluster,
      user: params.user,
      namespace: params.namespace,
    },
  });

  await writeKubeconfig(config);
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
  const config = await readKubeconfig();
  const idx = config.contexts.findIndex((c) => c.name === name);
  if (idx === -1) {
    throw new Error(`Context "${name}" not found`);
  }

  if (updates.cluster !== undefined) config.contexts[idx].context.cluster = updates.cluster;
  if (updates.user !== undefined) config.contexts[idx].context.user = updates.user;
  if (updates.namespace !== undefined) config.contexts[idx].context.namespace = updates.namespace;

  await writeKubeconfig(config);
}

/**
 * Delete a context from the kubeconfig.
 */
export async function deleteContext(name: string): Promise<void> {
  const config = await readKubeconfig();
  const idx = config.contexts.findIndex((c) => c.name === name);
  if (idx === -1) {
    throw new Error(`Context "${name}" not found`);
  }

  config.contexts.splice(idx, 1);

  // Clear current-context if it was the deleted one
  if (config['current-context'] === name) {
    config['current-context'] = config.contexts.length > 0 ? config.contexts[0].name : undefined;
  }

  await writeKubeconfig(config);
}

/**
 * Set the current context.
 */
export async function setCurrentContext(name: string): Promise<void> {
  const config = await readKubeconfig();
  const exists = config.contexts.some((c) => c.name === name);
  if (!exists) {
    throw new Error(`Context "${name}" not found`);
  }

  config['current-context'] = name;
  await writeKubeconfig(config);
}

export interface MergeResult {
  added: string[];
  skipped: string[];
  overwritten: string[];
}

/**
 * Merge an external kubeconfig into the current one.
 */
export async function mergeKubeconfig(
  externalYaml: string,
  strategy: 'skip' | 'overwrite' = 'skip'
): Promise<MergeResult> {
  const config = await readKubeconfig();
  const external = jsYaml.load(externalYaml) as Kubeconfig;
  const result: MergeResult = { added: [], skipped: [], overwritten: [] };

  if (!external) {
    throw new Error('Invalid kubeconfig YAML');
  }

  // Merge clusters
  for (const cluster of external.clusters || []) {
    const existingIdx = config.clusters.findIndex((c) => c.name === cluster.name);
    if (existingIdx >= 0) {
      if (strategy === 'overwrite') {
        config.clusters[existingIdx] = cluster;
        result.overwritten.push(`cluster/${cluster.name}`);
      } else {
        result.skipped.push(`cluster/${cluster.name}`);
      }
    } else {
      config.clusters.push(cluster);
      result.added.push(`cluster/${cluster.name}`);
    }
  }

  // Merge users
  for (const user of external.users || []) {
    const existingIdx = config.users.findIndex((u) => u.name === user.name);
    if (existingIdx >= 0) {
      if (strategy === 'overwrite') {
        config.users[existingIdx] = user;
        result.overwritten.push(`user/${user.name}`);
      } else {
        result.skipped.push(`user/${user.name}`);
      }
    } else {
      config.users.push(user);
      result.added.push(`user/${user.name}`);
    }
  }

  // Merge contexts
  for (const ctx of external.contexts || []) {
    const existingIdx = config.contexts.findIndex((c) => c.name === ctx.name);
    if (existingIdx >= 0) {
      if (strategy === 'overwrite') {
        config.contexts[existingIdx] = ctx;
        result.overwritten.push(`context/${ctx.name}`);
      } else {
        result.skipped.push(`context/${ctx.name}`);
      }
    } else {
      config.contexts.push(ctx);
      result.added.push(`context/${ctx.name}`);
    }
  }

  await writeKubeconfig(config);
  return result;
}
