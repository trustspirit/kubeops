import type { ArgoCDApplication } from './helpers';

const SEMVER_EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function parseParts(v: string): { nums: number[]; pre: string | null } {
  const [core, pre = null] = v.replace(/^v/, '').split('-', 2);
  const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, pre };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  // A prerelease is lower than the corresponding release.
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre) return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
  return 0;
}

export function selectLatestVersion(versions: string[]): string | null {
  const valid = versions.filter((v) => SEMVER_EXACT.test(v.trim()));
  if (valid.length === 0) return null;
  return valid.reduce((best, cur) => (compareSemver(cur, best) > 0 ? cur : best));
}

export function isChartUpdateAvailable(current: string | undefined, latest: string | undefined): boolean {
  if (!current || !latest) return false;
  return compareSemver(latest, current) > 0;
}

export function isTargetRevisionPinned(rev: string | undefined): boolean {
  if (!rev) return false;
  return SEMVER_EXACT.test(rev.trim());
}

export interface ArgoCDChartSource {
  chart: string;
  repoURL: string;
  targetRevision: string;
}

export function getChartSource(app: Pick<ArgoCDApplication, 'spec'>): ArgoCDChartSource | null {
  const source = app.spec?.source;
  if (!source?.chart) return null;
  return {
    chart: source.chart,
    repoURL: source.repoURL || '',
    targetRevision: source.targetRevision || '',
  };
}

export function getSyncedRevision(app: Pick<ArgoCDApplication, 'status'>): string | undefined {
  return app.status?.sync?.revision;
}

export function getSyncStatus(app: Pick<ArgoCDApplication, 'status'>): string | undefined {
  return app.status?.sync?.status;
}

export interface ArgoCDServerOpts {
  server?: string;
}

function serverArgs(opts?: ArgoCDServerOpts): string[] {
  return opts?.server ? ['--server', opts.server] : [];
}

export function buildAppGetArgs(app: string, opts?: ArgoCDServerOpts & { refresh?: boolean }): string[] {
  return ['app', 'get', app, '-o', 'json', ...(opts?.refresh ? ['--refresh'] : []), ...serverArgs(opts)];
}

export function buildAppSetRevisionArgs(app: string, revision: string, opts?: ArgoCDServerOpts): string[] {
  return ['app', 'set', app, '--revision', revision, ...serverArgs(opts)];
}

export function buildAppSyncArgs(app: string, opts?: ArgoCDServerOpts): string[] {
  return ['app', 'sync', app, ...serverArgs(opts)];
}

export interface ArgoCDLoginConfig {
  server: string;
  authMode?: string;
  username?: string;
  password?: string;
  grpcWeb?: string;
}

export function buildLoginArgs(config: ArgoCDLoginConfig): string[] {
  const args = ['login', config.server];
  if (config.authMode === 'username-password') {
    if (config.username) args.push('--username', config.username);
    if (config.password) args.push('--password', config.password);
  } else {
    args.push('--sso');
  }
  if (config.grpcWeb === 'true') args.push('--grpc-web');
  return args;
}

export function buildUserInfoArgs(opts?: ArgoCDServerOpts): string[] {
  return ['account', 'get-user-info', '-o', 'json', ...serverArgs(opts)];
}
