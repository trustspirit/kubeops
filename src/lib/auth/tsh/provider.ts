import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError } from '../cli-utils';

// Preserve last successful status to avoid UI flicker when tsh is temporarily
// slow or busy (timeout, parse error). Mirrors tsh-session-guard strategy.
// TTL prevents stale authenticated:true from persisting forever after tsh logout.
let lastKnownStatus: AuthProviderStatus | null = null;
let lastKnownStatusAt = 0;
const STATUS_PRESERVE_TTL = 90_000; // 90s — 3x the session guard TTL

export const tshProvider: AuthProvider = {
  id: 'tsh',
  name: 'Teleport',
  icon: 'Shield',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = findCli('tsh');
    if (!path) return { available: false };
    const version = getCliVersion(path, ['version']);
    return { available: true, path, version };
  },

  async getStatus(_config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = findCli('tsh');
    if (!path) {
      lastKnownStatus = { authenticated: false };
      lastKnownStatusAt = Date.now();
      return lastKnownStatus;
    }
    try {
      const output = runCli(path, ['status', '--format=json'], 10_000);
      const data = JSON.parse(output);
      const active = data?.active;
      if (!active?.username) {
        lastKnownStatus = { authenticated: false };
        lastKnownStatusAt = Date.now();
        return lastKnownStatus;
      }
      lastKnownStatus = {
        authenticated: true,
        user: active.username,
        expiresAt: active.valid_until ? new Date(active.valid_until) : undefined,
      };
      lastKnownStatusAt = Date.now();
      return lastKnownStatus;
    } catch {
      // On failure (timeout, tsh busy), preserve previous state to avoid
      // UI flicker — but only within the TTL window. After TTL, fall back
      // to unauthenticated to avoid stale state after tsh logout.
      if (lastKnownStatus && Date.now() - lastKnownStatusAt < STATUS_PRESERVE_TTL) {
        return lastKnownStatus;
      }
      return { authenticated: false };
    }
  },

  async login(config: Record<string, string>): Promise<{ success: boolean; output?: string; error?: string }> {
    const path = findCli('tsh');
    if (!path) return { success: false, error: 'tsh not found in PATH' };

    try {
      const { action = 'proxy-login', proxyUrl, authType, cluster } = config;

      if (action === 'proxy-login') {
        if (!proxyUrl) return { success: false, error: 'proxyUrl is required' };
        const args = ['login', `--proxy=${proxyUrl}`];
        if (authType) args.push(`--auth=${authType}`);
        const output = runCli(path, args, 120_000);
        return { success: true, output };
      }

      if (action === 'kube-login') {
        if (!cluster) return { success: false, error: 'cluster is required' };
        const output = runCli(path, ['kube', 'login', cluster], 30_000);
        return { success: true, output };
      }

      return { success: false, error: `Unknown action: ${action}` };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'tsh command failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'proxyUrl', label: 'Proxy URL', type: 'text', required: true, placeholder: 'teleport.example.com:443' },
      { key: 'authType', label: 'Auth Type', type: 'text', required: false, placeholder: 'e.g. teleport-github-connector, saml, oidc' },
    ];
  },
};
