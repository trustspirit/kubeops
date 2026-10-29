import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError, findUnsafeCliValue } from '../cli-utils';

// Preserve last successful status so transient `az` failures don't flip the
// persisted client cache to authenticated:false and trigger a spurious
// auto-login on next cold start.
const STATUS_PRESERVE_TTL = 90_000;
let lastKnownStatus: AuthProviderStatus | null = null;
let lastKnownStatusAt = 0;

export const aksProvider: AuthProvider = {
  id: 'aks',
  name: 'Azure AKS',
  icon: 'Cloud',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = await findCli('az');
    if (!path) return { available: false };
    const version = await getCliVersion(path, ['version', '--output', 'tsv']);
    return { available: true, path, version };
  },

  async getStatus(): Promise<AuthProviderStatus> {
    const path = await findCli('az');
    if (!path) return { authenticated: false };
    try {
      const output = await runCli(path, ['account', 'show', '--output', 'json'], 5_000);
      const data = JSON.parse(output);
      // Best-effort: ask Azure for the actual token expiry. If this fails or
      // returns nothing parseable, fall back to a 50-minute approximation
      // (default lifetime is ~1h) so the persisted-cache freshness check
      // re-prompts the user on time instead of trusting the 12h default.
      let expiresAt: Date | undefined;
      try {
        const tokenOutput = await runCli(path, ['account', 'get-access-token', '--output', 'json'], 5_000);
        const tokenData = JSON.parse(tokenOutput);
        const raw = tokenData.expiresOn || tokenData.expires_on || tokenData.expiresOnTimestamp;
        if (raw) {
          const parsed = typeof raw === 'number' ? new Date(raw * 1000) : new Date(raw);
          if (!Number.isNaN(parsed.getTime())) expiresAt = parsed;
        }
      } catch { /* non-fatal */ }
      if (!expiresAt) expiresAt = new Date(Date.now() + 50 * 60_000);

      const status: AuthProviderStatus = {
        authenticated: true,
        user: data.user?.name || data.name,
        expiresAt,
      };
      lastKnownStatus = status;
      lastKnownStatusAt = Date.now();
      return status;
    } catch {
      if (lastKnownStatus && Date.now() - lastKnownStatusAt < STATUS_PRESERVE_TTL) {
        return lastKnownStatus;
      }
      return { authenticated: false };
    }
  },

  async login(config: Record<string, string>) {
    const path = await findCli('az');
    if (!path) return { success: false, error: 'az CLI not found in PATH' };

    const { subscription, resourceGroup, clusterName } = config;
    const unsafe = findUnsafeCliValue({ subscription, resourceGroup, clusterName });
    if (unsafe) return { success: false, error: `Invalid ${unsafe}` };

    try {
      // Step 1: Azure login
      await runCli(path, ['login'], 120_000, { label: 'Login' });

      // Step 2: Get AKS credentials if info provided
      if (clusterName && resourceGroup) {
        const args = ['aks', 'get-credentials', '--resource-group', resourceGroup, '--name', clusterName];
        if (subscription) args.push('--subscription', subscription);
        await runCli(path, args, 30_000);
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'AKS login failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'subscription', label: 'Subscription ID', type: 'text', required: false, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'resourceGroup', label: 'Resource Group', type: 'text', required: true, placeholder: 'my-resource-group' },
      { key: 'clusterName', label: 'Cluster Name', type: 'text', required: false, placeholder: 'my-aks-cluster' },
    ];
  },
};
