import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError } from '../cli-utils';

export const oidcProvider: AuthProvider = {
  id: 'oidc',
  name: 'OIDC (kubelogin)',
  icon: 'KeyRound',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = findCli('kubectl-oidc_login') || findCli('kubelogin');
    if (!path) return { available: false };
    const version = getCliVersion(path, ['--version']);
    return { available: true, path, version };
  },

  async getStatus(_config: Record<string, string>): Promise<AuthProviderStatus> {
    // OIDC token validity is best checked by attempting a cluster API call.
    // The provider itself cannot determine status without cluster context.
    return { authenticated: false };
  },

  async login(config: Record<string, string>) {
    const path = findCli('kubectl-oidc_login') || findCli('kubelogin');
    if (!path) return { success: false, error: 'kubelogin not found in PATH. Install: kubectl krew install oidc-login' };

    try {
      const { issuerUrl, clientId } = config;
      const args = ['get-token'];
      if (issuerUrl) args.push(`--oidc-issuer-url=${issuerUrl}`);
      if (clientId) args.push(`--oidc-client-id=${clientId}`);

      const output = runCli(path, args, 120_000);
      return { success: true, output };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'OIDC login failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'issuerUrl', label: 'OIDC Issuer URL', type: 'text', required: false, placeholder: 'https://dex.example.com' },
      { key: 'clientId', label: 'Client ID', type: 'text', required: false, placeholder: 'kubelogin' },
    ];
  },
};
