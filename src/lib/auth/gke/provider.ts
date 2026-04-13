import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError } from '../cli-utils';

export const gkeProvider: AuthProvider = {
  id: 'gke',
  name: 'Google GKE',
  icon: 'Cloud',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = findCli('gcloud');
    if (!path) return { available: false };
    const version = getCliVersion(path, ['version', '--format=value(version)']);
    return { available: true, path, version };
  },

  async getStatus(_config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = findCli('gcloud');
    if (!path) return { authenticated: false };
    try {
      runCli(path, ['auth', 'print-access-token'], 5_000);
    } catch {
      return { authenticated: false };
    }
    // Account lookup is best-effort — don't fail auth status if only this fails
    let account: string | undefined;
    try {
      account = runCli(path, ['config', 'get-value', 'account'], 5_000).trim() || undefined;
    } catch { /* non-fatal */ }
    return { authenticated: true, user: account };
  },

  async login(config: Record<string, string>) {
    const path = findCli('gcloud');
    if (!path) return { success: false, error: 'gcloud CLI not found in PATH' };

    try {
      // Step 1: Auth login
      runCli(path, ['auth', 'login'], 120_000);

      // Step 2: Get credentials if cluster info provided
      const { project, region, clusterName } = config;
      if (clusterName && region && project) {
        runCli(path, [
          'container', 'clusters', 'get-credentials', clusterName,
          '--region', region, '--project', project,
        ], 30_000);
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'GKE login failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'project', label: 'Project ID', type: 'text', required: false, placeholder: 'my-project' },
      { key: 'region', label: 'Region', type: 'text', required: false, placeholder: 'asia-northeast3' },
      { key: 'clusterName', label: 'Cluster Name', type: 'text', required: false, placeholder: 'my-gke-cluster' },
    ];
  },
};
