import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError, findUnsafeCliValue } from '../cli-utils';

// Preserve last successful status so a transient `gcloud` failure doesn't
// flip the persisted client cache to authenticated:false and trigger a
// spurious auto-login on next cold start. TTL caps the staleness.
const STATUS_PRESERVE_TTL = 90_000;
let lastKnownStatus: AuthProviderStatus | null = null;
let lastKnownStatusAt = 0;

export const gkeProvider: AuthProvider = {
  id: 'gke',
  name: 'Google GKE',
  icon: 'Cloud',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = await findCli('gcloud');
    if (!path) return { available: false };
    const version = await getCliVersion(path, ['version', '--format=value(version)']);
    return { available: true, path, version };
  },

  async getStatus(): Promise<AuthProviderStatus> {
    const path = await findCli('gcloud');
    if (!path) return { authenticated: false };
    try {
      await runCli(path, ['auth', 'print-access-token'], 5_000);
    } catch {
      if (lastKnownStatus && Date.now() - lastKnownStatusAt < STATUS_PRESERVE_TTL) {
        return lastKnownStatus;
      }
      return { authenticated: false };
    }
    // Account lookup is best-effort — don't fail auth status if only this fails
    let account: string | undefined;
    try {
      account = (await runCli(path, ['config', 'get-value', 'account'], 5_000)).trim() || undefined;
    } catch { /* non-fatal */ }
    // gcloud access tokens are short-lived (~1h). Approximate expiry so the
    // persisted-cache freshness check can flip to "needs re-login" sooner
    // than the 12h default window.
    const status: AuthProviderStatus = {
      authenticated: true,
      user: account,
      expiresAt: new Date(Date.now() + 55 * 60_000),
    };
    lastKnownStatus = status;
    lastKnownStatusAt = Date.now();
    return status;
  },

  async login(config: Record<string, string>) {
    const path = await findCli('gcloud');
    if (!path) return { success: false, error: 'gcloud CLI not found in PATH' };

    // Validate before opening the browser flow, not after it succeeds.
    // clusterName is positional, so a leading '-' would be read as a flag.
    const { project, region, clusterName } = config;
    const unsafe = findUnsafeCliValue({ project, region, clusterName });
    if (unsafe) return { success: false, error: `Invalid ${unsafe}` };

    try {
      // Step 1: Auth login
      await runCli(path, ['auth', 'login'], 120_000, { label: 'Login' });

      // Step 2: Get credentials if cluster info provided
      if (clusterName && region && project) {
        await runCli(path, [
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
