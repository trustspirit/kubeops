import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError } from '../cli-utils';

export const aksProvider: AuthProvider = {
  id: 'aks',
  name: 'Azure AKS',
  icon: 'Cloud',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = findCli('az');
    if (!path) return { available: false };
    const version = getCliVersion(path, ['version', '--output', 'tsv']);
    return { available: true, path, version };
  },

  async getStatus(_config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = findCli('az');
    if (!path) return { authenticated: false };
    try {
      const output = runCli(path, ['account', 'show', '--output', 'json'], 5_000);
      const data = JSON.parse(output);
      return {
        authenticated: true,
        user: data.user?.name || data.name,
      };
    } catch {
      return { authenticated: false };
    }
  },

  async login(config: Record<string, string>) {
    const path = findCli('az');
    if (!path) return { success: false, error: 'az CLI not found in PATH' };

    try {
      // Step 1: Azure login
      runCli(path, ['login'], 120_000);

      // Step 2: Get AKS credentials if info provided
      const { subscription, resourceGroup, clusterName } = config;
      if (clusterName && resourceGroup) {
        const args = ['aks', 'get-credentials', '--resource-group', resourceGroup, '--name', clusterName];
        if (subscription) args.push('--subscription', subscription);
        runCli(path, args, 30_000);
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
