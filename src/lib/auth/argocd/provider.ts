import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError } from '../cli-utils';
import { buildLoginArgs, buildUserInfoArgs } from '@/lib/argocd/sync-latest';

let lastKnownStatus: AuthProviderStatus | null = null;
let lastKnownStatusAt = 0;
const STATUS_PRESERVE_TTL = 90_000;

export const argocdProvider: AuthProvider = {
  id: 'argocd',
  name: 'ArgoCD',
  icon: 'GitMerge',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = await findCli('argocd');
    if (!path) return { available: false };
    const version = await getCliVersion(path, ['version', '--client', '--short']);
    return { available: true, path, version };
  },

  async getStatus(config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = await findCli('argocd');
    if (!path) {
      lastKnownStatus = { authenticated: false };
      lastKnownStatusAt = Date.now();
      return lastKnownStatus;
    }
    try {
      const output = await runCli(path, buildUserInfoArgs({ server: config.server }), 10_000);
      const data = JSON.parse(output);
      if (!data?.loggedIn) {
        lastKnownStatus = { authenticated: false };
        lastKnownStatusAt = Date.now();
        return lastKnownStatus;
      }
      lastKnownStatus = { authenticated: true, user: data.username };
      lastKnownStatusAt = Date.now();
      return lastKnownStatus;
    } catch {
      if (lastKnownStatus && Date.now() - lastKnownStatusAt < STATUS_PRESERVE_TTL) {
        return lastKnownStatus;
      }
      return { authenticated: false };
    }
  },

  async login(config: Record<string, string>): Promise<{ success: boolean; output?: string; error?: string }> {
    const path = await findCli('argocd');
    if (!path) return { success: false, error: 'argocd not found in PATH' };
    if (!config.server) return { success: false, error: 'server is required' };
    try {
      const output = await runCli(
        path,
        buildLoginArgs({
          server: config.server,
          authMode: config.authMode,
          username: config.username,
          password: config.password,
          grpcWeb: config.grpcWeb,
        }),
        120_000,
        { label: 'Login' },
      );
      return { success: true, output };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'argocd login failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'server', label: 'Server', type: 'text', required: true, placeholder: 'argocd-root.ovdr.io' },
      {
        key: 'authMode',
        label: 'Auth Mode',
        type: 'select',
        required: false,
        options: [{ value: 'sso', label: 'SSO (browser)' }],
      },
      {
        key: 'grpcWeb',
        label: 'gRPC-Web',
        type: 'select',
        required: false,
        options: [
          { value: 'false', label: 'Off' },
          { value: 'true', label: 'On (--grpc-web)' },
        ],
      },
    ];
  },
};
