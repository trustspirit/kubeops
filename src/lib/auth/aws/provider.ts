import type { AuthProvider, AuthProviderAvailability, AuthProviderStatus, AuthConfigField } from '../types';
import { findCli, getCliVersion, runCli, extractCliError } from '../cli-utils';

function getAwsPath(): string | null {
  return findCli('aws');
}

// Preserve last successful status per (provider, profile) so a transient
// CLI failure (timeout, network blip) does not flip the UI — and the
// persisted client cache — to authenticated:false and then trigger a
// spurious auto-login on the next cold start. Mirrors the tsh provider
// strategy; TTL caps the staleness if creds actually got revoked externally.
const STATUS_PRESERVE_TTL = 90_000;
type CachedStatus = { status: AuthProviderStatus; at: number };
const lastKnownStatus = new Map<string, CachedStatus>();

async function checkAwsStatus(awsPath: string, profile?: string): Promise<AuthProviderStatus> {
  const cacheKey = profile || '__default__';
  try {
    const args = ['sts', 'get-caller-identity', '--output', 'json'];
    if (profile) args.push('--profile', profile);
    const output = runCli(awsPath, args, 5_000);
    const data = JSON.parse(output);
    const status: AuthProviderStatus = {
      authenticated: true,
      user: data.Arn?.split('/').pop() || data.UserId,
    };
    lastKnownStatus.set(cacheKey, { status, at: Date.now() });
    return status;
  } catch {
    const prev = lastKnownStatus.get(cacheKey);
    if (prev && Date.now() - prev.at < STATUS_PRESERVE_TTL) {
      return prev.status;
    }
    return { authenticated: false };
  }
}

export const awsSsoProvider: AuthProvider = {
  id: 'aws-sso',
  name: 'AWS EKS (SSO)',
  icon: 'Cloud',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const path = getAwsPath();
    if (!path) return { available: false };
    const version = getCliVersion(path, ['--version']);
    return { available: true, path, version };
  },

  async getStatus(config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = getAwsPath();
    if (!path) return { authenticated: false };
    return checkAwsStatus(path, config.profile);
  },

  async login(config: Record<string, string>) {
    const path = getAwsPath();
    if (!path) return { success: false, error: 'aws CLI not found in PATH' };

    try {
      const { profile, region, clusterName } = config;

      // Step 1: SSO login
      const ssoArgs = ['sso', 'login'];
      if (profile) ssoArgs.push('--profile', profile);
      runCli(path, ssoArgs, 120_000);

      // Step 2: Update kubeconfig if cluster info provided
      if (clusterName && region) {
        const kubeconfigArgs = ['eks', 'update-kubeconfig', '--name', clusterName, '--region', region];
        if (profile) kubeconfigArgs.push('--profile', profile);
        runCli(path, kubeconfigArgs, 30_000);
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'AWS SSO login failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'profile', label: 'AWS Profile', type: 'text', required: false, placeholder: 'default' },
      { key: 'region', label: 'Region', type: 'text', required: false, placeholder: 'ap-northeast-2' },
      { key: 'clusterName', label: 'EKS Cluster Name', type: 'text', required: false, placeholder: 'my-cluster' },
    ];
  },
};

export const awsIamProvider: AuthProvider = {
  id: 'aws-iam',
  name: 'AWS EKS (IAM)',
  icon: 'Cloud',

  async checkAvailability(): Promise<AuthProviderAvailability> {
    const iamAuth = findCli('aws-iam-authenticator');
    const awsCli = getAwsPath();
    const path = iamAuth || awsCli;
    if (!path) return { available: false };
    return { available: true, path };
  },

  async getStatus(config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = getAwsPath();
    if (!path) return { authenticated: false };
    return checkAwsStatus(path, config.profile);
  },

  async login(config: Record<string, string>) {
    const path = getAwsPath();
    if (!path) return { success: false, error: 'aws CLI not found in PATH' };

    try {
      const { profile } = config;
      const args = ['sts', 'get-caller-identity', '--output', 'json'];
      if (profile) args.push('--profile', profile);
      runCli(path, args, 10_000);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: extractCliError(err, 'AWS IAM authentication failed') };
    }
  },

  getConfigFields(): AuthConfigField[] {
    return [
      { key: 'profile', label: 'AWS Profile', type: 'text', required: false, placeholder: 'default' },
    ];
  },
};
