import type { ArgoCDApplication } from './helpers';

const APP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SERVER_RE = /^[A-Za-z0-9.-]+(?::\d+)?$/;
const REVISION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

function assertSafeArg(value: string, kind: string, pattern: RegExp): void {
  if (!value || value.startsWith('-') || !pattern.test(value)) {
    throw new Error(`Invalid ArgoCD ${kind}: ${JSON.stringify(value)}`);
  }
}

const SEMVER_EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function parseParts(v: string): { nums: number[]; pre: string | null } {
  const normalized = v.replace(/^v/, '');
  const idx = normalized.indexOf('-');
  const core = idx < 0 ? normalized : normalized.slice(0, idx);
  const pre = idx < 0 ? null : normalized.slice(idx + 1);

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
  if (pa.pre && pb.pre) {
    // Compare prerelease identifiers per semver spec
    const aIds = pa.pre.split('.');
    const bIds = pb.pre.split('.');
    for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
      const aId = aIds[i];
      const bId = bIds[i];

      // If one is missing, the longer one is greater
      if (aId === undefined) return -1;
      if (bId === undefined) return 1;

      const aIsNum = /^\d+$/.test(aId);
      const bIsNum = /^\d+$/.test(bId);

      if (aIsNum && bIsNum) {
        // Both numeric, compare numerically
        const diff = parseInt(aId, 10) - parseInt(bId, 10);
        if (diff !== 0) return diff;
      } else if (aIsNum !== bIsNum) {
        // One is numeric, one is not; numeric is lower
        return aIsNum ? -1 : 1;
      } else {
        // Both are non-numeric, compare lexically
        if (aId < bId) return -1;
        if (aId > bId) return 1;
      }
    }
    return 0;
  }
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
  if (opts?.server) {
    assertSafeArg(opts.server, 'server', SERVER_RE);
    return ['--server', opts.server];
  }
  return [];
}

export function buildAppGetArgs(app: string, opts?: ArgoCDServerOpts & { refresh?: boolean }): string[] {
  assertSafeArg(app, 'app name', APP_NAME_RE);
  return ['app', 'get', app, '-o', 'json', ...(opts?.refresh ? ['--refresh'] : []), ...serverArgs(opts)];
}

export function buildAppSetRevisionArgs(app: string, revision: string, opts?: ArgoCDServerOpts): string[] {
  assertSafeArg(app, 'app name', APP_NAME_RE);
  assertSafeArg(revision, 'revision', REVISION_RE);
  return ['app', 'set', app, '--revision', revision, ...serverArgs(opts)];
}

export function buildAppSyncArgs(app: string, opts?: ArgoCDServerOpts): string[] {
  assertSafeArg(app, 'app name', APP_NAME_RE);
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
  assertSafeArg(config.server, 'server', SERVER_RE);
  const args = ['login', config.server];
  if (config.authMode === 'username-password') {
    if (config.username) {
      assertSafeArg(config.username, 'username', USERNAME_RE);
      args.push('--username', config.username);
    }
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
