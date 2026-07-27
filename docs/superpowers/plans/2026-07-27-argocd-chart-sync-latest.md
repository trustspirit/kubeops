# ArgoCD Chart "Sync to Latest" + In-UI Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a KubeOps user detect when an ArgoCD Application's Helm chart has a newer version available and sync the app to it, and log in to ArgoCD from the UI — all via the `argocd` CLI.

**Architecture:** Add an `argocd` auth provider to the existing auth-provider framework (login runs from a UI button via `argocd login --sso`). Add a server-side route that shells out to the `argocd` CLI (reusing `src/lib/auth/cli-utils.ts`) to inspect an app, resolve the latest chart version, and sync. Ship the floating-`targetRevision` path first (refresh + sync); implement pinned-version enumeration as the final task.

**Tech Stack:** Next.js (app router API routes), React + zustand + sonner + shadcn/ui, `@kubernetes/client-node` (existing, not used here), `argocd` CLI (new optional dependency), tests via `node:test` + `node:assert/strict` run with `npx tsx --test`.

## Global Constraints

- Tests use `node:test` + `node:assert/strict`, run with `npx tsx --test <file>`. No jest/vitest.
- Shell out to CLIs only via `src/lib/auth/cli-utils.ts` (`findCli`, `runCli`, `getCliVersion`, `extractCliError`) — `execFileSync`, never a shell string.
- Server routes cannot read client settings (localStorage/zustand). The ArgoCD server URL is passed in the request body (mirrors `/api/auth/[providerId]/login`). `--server` is only added when a value is present.
- KubeOps stores no ArgoCD tokens; auth is delegated entirely to the `argocd` CLI session (`~/.config/argocd/config`).
- v1 supports **single Helm-chart source** apps (`spec.source.chart`). Git-source and multi-source apps are out of scope (button hidden).
- Import alias `@/` maps to `src/`.
- Commit after every task on branch `feat/argocd-chart-sync-latest` (already created).

---

### Task 1: Pure helpers — version logic, app parsing, CLI arg builders

**Files:**
- Create: `src/lib/argocd/sync-latest.ts`
- Test: `src/lib/argocd/sync-latest.test.ts`

**Interfaces:**
- Consumes: `ArgoCDApplication` type from `src/lib/argocd/helpers.ts`.
- Produces:
  - `compareSemver(a: string, b: string): number`
  - `selectLatestVersion(versions: string[]): string | null`
  - `isChartUpdateAvailable(current: string | undefined, latest: string | undefined): boolean`
  - `isTargetRevisionPinned(rev: string | undefined): boolean`
  - `interface ArgoCDChartSource { chart: string; repoURL: string; targetRevision: string }`
  - `getChartSource(app: Pick<ArgoCDApplication, 'spec'>): ArgoCDChartSource | null`
  - `getSyncedRevision(app: Pick<ArgoCDApplication, 'status'>): string | undefined`
  - `getSyncStatus(app: Pick<ArgoCDApplication, 'status'>): string | undefined`
  - `interface ArgoCDServerOpts { server?: string }`
  - `buildAppGetArgs(app: string, opts?: ArgoCDServerOpts & { refresh?: boolean }): string[]`
  - `buildAppSetRevisionArgs(app: string, revision: string, opts?: ArgoCDServerOpts): string[]`
  - `buildAppSyncArgs(app: string, opts?: ArgoCDServerOpts): string[]`
  - `interface ArgoCDLoginConfig { server: string; authMode?: string; username?: string; password?: string; grpcWeb?: string }`
  - `buildLoginArgs(config: ArgoCDLoginConfig): string[]`
  - `buildUserInfoArgs(opts?: ArgoCDServerOpts): string[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/argocd/sync-latest.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareSemver,
  selectLatestVersion,
  isChartUpdateAvailable,
  isTargetRevisionPinned,
  getChartSource,
  getSyncedRevision,
  getSyncStatus,
  buildAppGetArgs,
  buildAppSetRevisionArgs,
  buildAppSyncArgs,
  buildLoginArgs,
  buildUserInfoArgs,
} from './sync-latest';

describe('compareSemver', () => {
  it('orders by major, minor, patch', () => {
    assert.equal(compareSemver('1.2.3', '1.2.4') < 0, true);
    assert.equal(compareSemver('2.0.0', '1.9.9') > 0, true);
    assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  });
  it('treats a prerelease as lower than its release', () => {
    assert.equal(compareSemver('1.2.3-rc.1', '1.2.3') < 0, true);
  });
});

describe('selectLatestVersion', () => {
  it('returns the highest semver', () => {
    assert.equal(selectLatestVersion(['1.2.0', '1.10.0', '1.9.0']), '1.10.0');
  });
  it('returns null for an empty list', () => {
    assert.equal(selectLatestVersion([]), null);
  });
});

describe('isChartUpdateAvailable', () => {
  it('is true when latest is strictly greater', () => {
    assert.equal(isChartUpdateAvailable('1.2.3', '1.3.0'), true);
  });
  it('is false when equal or unknown', () => {
    assert.equal(isChartUpdateAvailable('1.3.0', '1.3.0'), false);
    assert.equal(isChartUpdateAvailable(undefined, '1.3.0'), false);
    assert.equal(isChartUpdateAvailable('1.2.3', undefined), false);
  });
});

describe('isTargetRevisionPinned', () => {
  it('treats an exact semver as pinned', () => {
    assert.equal(isTargetRevisionPinned('1.2.3'), true);
    assert.equal(isTargetRevisionPinned('1.2.3-rc.1'), true);
  });
  it('treats ranges and empty as floating', () => {
    assert.equal(isTargetRevisionPinned('1.2.*'), false);
    assert.equal(isTargetRevisionPinned('>=1.0.0'), false);
    assert.equal(isTargetRevisionPinned('^1.2.0'), false);
    assert.equal(isTargetRevisionPinned(''), false);
    assert.equal(isTargetRevisionPinned(undefined), false);
  });
});

describe('getChartSource', () => {
  it('extracts chart/repoURL/targetRevision from a single helm source', () => {
    assert.deepEqual(
      getChartSource({ spec: { source: { chart: 'my-chart', repoURL: 'https://charts.example', targetRevision: '1.2.3' } } }),
      { chart: 'my-chart', repoURL: 'https://charts.example', targetRevision: '1.2.3' },
    );
  });
  it('returns null for a git source (no chart)', () => {
    assert.equal(getChartSource({ spec: { source: { repoURL: 'https://git', path: 'apps/x' } } }), null);
  });
  it('returns null for multi-source apps in v1', () => {
    assert.equal(getChartSource({ spec: { sources: [{ chart: 'a' }] } }), null);
  });
});

describe('status readers', () => {
  it('reads synced revision and sync status', () => {
    const app = { status: { sync: { revision: '1.2.3', status: 'OutOfSync' } } };
    assert.equal(getSyncedRevision(app), '1.2.3');
    assert.equal(getSyncStatus(app), 'OutOfSync');
  });
});

describe('arg builders', () => {
  it('builds app get args with refresh and server', () => {
    assert.deepEqual(
      buildAppGetArgs('web', { server: 'argocd-root.ovdr.io', refresh: true }),
      ['app', 'get', 'web', '-o', 'json', '--refresh', '--server', 'argocd-root.ovdr.io'],
    );
  });
  it('builds app get args without optionals', () => {
    assert.deepEqual(buildAppGetArgs('web'), ['app', 'get', 'web', '-o', 'json']);
  });
  it('builds set-revision and sync args', () => {
    assert.deepEqual(buildAppSetRevisionArgs('web', '1.3.0'), ['app', 'set', 'web', '--revision', '1.3.0']);
    assert.deepEqual(buildAppSyncArgs('web', { server: 's' }), ['app', 'sync', 'web', '--server', 's']);
  });
  it('builds sso login args', () => {
    assert.deepEqual(
      buildLoginArgs({ server: 'argocd-root.ovdr.io', authMode: 'sso', grpcWeb: 'true' }),
      ['login', 'argocd-root.ovdr.io', '--sso', '--grpc-web'],
    );
  });
  it('builds username/password login args', () => {
    assert.deepEqual(
      buildLoginArgs({ server: 's', authMode: 'username-password', username: 'u', password: 'p' }),
      ['login', 's', '--username', 'u', '--password', 'p'],
    );
  });
  it('builds user-info args', () => {
    assert.deepEqual(buildUserInfoArgs({ server: 's' }), ['account', 'get-user-info', '-o', 'json', '--server', 's']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/argocd/sync-latest.test.ts`
Expected: FAIL — cannot find module `./sync-latest`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/argocd/sync-latest.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/argocd/sync-latest.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/argocd/sync-latest.ts src/lib/argocd/sync-latest.test.ts
git commit -m "feat(argocd): add chart version + CLI arg helpers for sync-to-latest"
```

---

### Task 2: ArgoCD auth provider (UI login)

**Files:**
- Create: `src/lib/auth/argocd/provider.ts`
- Modify: `src/lib/auth/providers.ts`
- Test: `src/lib/auth/argocd/provider.test.ts`

**Interfaces:**
- Consumes: `AuthProvider`, `AuthConfigField` from `src/lib/auth/types.ts`; `findCli`, `getCliVersion`, `runCli`, `extractCliError` from `src/lib/auth/cli-utils.ts`; `buildLoginArgs`, `buildUserInfoArgs` from `src/lib/argocd/sync-latest.ts`.
- Produces: `argocdProvider: AuthProvider` (`id: 'argocd'`), registered in `providers.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/argocd/provider.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { argocdProvider } from './provider';

describe('argocdProvider', () => {
  it('has the expected identity', () => {
    assert.equal(argocdProvider.id, 'argocd');
    assert.equal(argocdProvider.name, 'ArgoCD');
  });
  it('exposes a required Server field', () => {
    const fields = argocdProvider.getConfigFields();
    const server = fields.find((f) => f.key === 'server');
    assert.ok(server, 'server field exists');
    assert.equal(server?.required, true);
  });
  it('offers an auth mode select including sso', () => {
    const fields = argocdProvider.getConfigFields();
    const mode = fields.find((f) => f.key === 'authMode');
    assert.equal(mode?.type, 'select');
    assert.ok(mode?.options?.some((o) => o.value === 'sso'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/auth/argocd/provider.test.ts`
Expected: FAIL — cannot find module `./provider`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/argocd/provider.ts`:

```ts
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
    const path = findCli('argocd');
    if (!path) return { available: false };
    const version = getCliVersion(path, ['version', '--client', '--short']);
    return { available: true, path, version };
  },

  async getStatus(config: Record<string, string>): Promise<AuthProviderStatus> {
    const path = findCli('argocd');
    if (!path) {
      lastKnownStatus = { authenticated: false };
      lastKnownStatusAt = Date.now();
      return lastKnownStatus;
    }
    try {
      const output = runCli(path, buildUserInfoArgs({ server: config.server }), 10_000);
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
    const path = findCli('argocd');
    if (!path) return { success: false, error: 'argocd not found in PATH' };
    if (!config.server) return { success: false, error: 'server is required' };
    try {
      const output = runCli(
        path,
        buildLoginArgs({
          server: config.server,
          authMode: config.authMode,
          username: config.username,
          password: config.password,
          grpcWeb: config.grpcWeb,
        }),
        120_000,
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
        options: [
          { value: 'sso', label: 'SSO (browser)' },
          { value: 'username-password', label: 'Username / Password' },
        ],
      },
      { key: 'username', label: 'Username', type: 'text', required: false, placeholder: '(username/password mode only)' },
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
```

Then register it in `src/lib/auth/providers.ts` — add the import and the `registerProvider` call:

```ts
import { argocdProvider } from './argocd/provider';
```

and inside `registerAllProviders()`, after `registerProvider(aksProvider);`:

```ts
  registerProvider(argocdProvider);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/auth/argocd/provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify lint of touched files**

Run: `npx eslint src/lib/auth/argocd/provider.ts src/lib/auth/providers.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/argocd/provider.ts src/lib/auth/argocd/provider.test.ts src/lib/auth/providers.ts
git commit -m "feat(auth): add ArgoCD auth provider with in-UI login"
```

---

### Task 3: sync-chart-latest API route (floating-revision path)

**Files:**
- Create: `src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.ts`
- Test: `src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.test.ts`

**Interfaces:**
- Consumes: `findCli`, `runCli`, `extractCliError` from `src/lib/auth/cli-utils.ts`; helpers from `src/lib/argocd/sync-latest.ts`; `ArgoCDApplication` from `src/lib/argocd/helpers.ts`.
- Produces: `POST` handler. Request body: `{ namespace: string; server?: string; checkOnly?: boolean; sync?: boolean }`. Also exports a pure orchestrator `planChartSync(app, { checkOnly }): ChartSyncPlan` for testing.
- `interface ChartSyncPlan { pinned: boolean; chart: string; currentRevision: string; syncedRevision?: string; syncStatus?: string; updateAvailable: boolean; latest?: string; supported: boolean; reason?: string }`

- [ ] **Step 1: Write the failing test for the pure orchestrator**

Create `src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planChartSync } from './route';

const floatingOutOfSync = {
  spec: { source: { chart: 'web', repoURL: 'https://charts', targetRevision: '1.2.*' } },
  status: { sync: { revision: '1.3.0', status: 'OutOfSync' } },
};

describe('planChartSync', () => {
  it('flags a floating app that is OutOfSync as an available update', () => {
    const plan = planChartSync(floatingOutOfSync, { checkOnly: true });
    assert.equal(plan.pinned, false);
    assert.equal(plan.chart, 'web');
    assert.equal(plan.updateAvailable, true);
    assert.equal(plan.supported, true);
  });

  it('flags a synced floating app as up to date', () => {
    const plan = planChartSync(
      { spec: { source: { chart: 'web', targetRevision: '1.2.*' } }, status: { sync: { revision: '1.2.9', status: 'Synced' } } },
      { checkOnly: true },
    );
    assert.equal(plan.updateAvailable, false);
  });

  it('marks a pinned app unsupported in the floating-only route', () => {
    const plan = planChartSync(
      { spec: { source: { chart: 'web', targetRevision: '1.2.3' } }, status: { sync: { revision: '1.2.3', status: 'Synced' } } },
      { checkOnly: true },
    );
    assert.equal(plan.pinned, true);
    assert.equal(plan.supported, false);
    assert.ok(plan.reason);
  });

  it('returns supported:false with a reason for a non-helm app', () => {
    const plan = planChartSync({ spec: { source: { repoURL: 'https://git', path: 'x' } }, status: {} }, { checkOnly: true });
    assert.equal(plan.supported, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.test.ts"`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route implementation**

Create `src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { findCli, runCli, extractCliError } from '@/lib/auth/cli-utils';
import type { ArgoCDApplication } from '@/lib/argocd/helpers';
import {
  buildAppGetArgs,
  buildAppSyncArgs,
  getChartSource,
  getSyncedRevision,
  getSyncStatus,
  isTargetRevisionPinned,
} from '@/lib/argocd/sync-latest';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ clusterId: string; appName: string }>;
}

interface Body {
  namespace?: string;
  server?: string;
  checkOnly?: boolean;
  sync?: boolean;
}

export interface ChartSyncPlan {
  pinned: boolean;
  chart: string;
  currentRevision: string;
  syncedRevision?: string;
  syncStatus?: string;
  updateAvailable: boolean;
  latest?: string;
  supported: boolean;
  reason?: string;
}

// Pure decision logic — no CLI/IO — so it is unit-testable.
export function planChartSync(
  app: Pick<ArgoCDApplication, 'spec' | 'status'>,
  _opts: { checkOnly?: boolean },
): ChartSyncPlan {
  const source = getChartSource(app);
  if (!source) {
    return {
      pinned: false, chart: '', currentRevision: '', updateAvailable: false,
      supported: false, reason: 'Application is not a single Helm chart source',
    };
  }
  const pinned = isTargetRevisionPinned(source.targetRevision);
  const syncedRevision = getSyncedRevision(app);
  const syncStatus = getSyncStatus(app);
  if (pinned) {
    return {
      pinned: true, chart: source.chart, currentRevision: source.targetRevision,
      syncedRevision, syncStatus, updateAvailable: false, supported: false,
      reason: 'Pinned targetRevision — enumerating newer chart versions is not yet supported',
    };
  }
  return {
    pinned: false, chart: source.chart, currentRevision: source.targetRevision,
    syncedRevision, syncStatus,
    updateAvailable: syncStatus === 'OutOfSync',
    supported: true,
  };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const argocdPath = findCli('argocd');
  if (!argocdPath) {
    return NextResponse.json(
      { error: 'argocd CLI not found. Install it and run login from Settings > Auth Providers.' },
      { status: 503 },
    );
  }

  const { appName } = await params;
  const app = decodeURIComponent(appName);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const server = body.server?.trim() || undefined;

  let appJson: Pick<ArgoCDApplication, 'spec' | 'status'>;
  try {
    const out = runCli(argocdPath, buildAppGetArgs(app, { server, refresh: true }), 60_000);
    appJson = JSON.parse(out);
  } catch (err: unknown) {
    const message = extractCliError(err, `Failed to read ArgoCD app "${app}"`);
    const needsLogin = /not logged in|please login|Unauthenticated|token/i.test(message);
    return NextResponse.json({ error: message, needsLogin }, { status: needsLogin ? 401 : 500 });
  }

  const plan = planChartSync(appJson, { checkOnly: body.checkOnly });

  if (!plan.supported) {
    return NextResponse.json({ ...plan }, { status: 400 });
  }
  if (body.checkOnly) {
    return NextResponse.json({ ...plan });
  }
  if (!plan.updateAvailable) {
    return NextResponse.json({ ...plan, skipped: true });
  }

  try {
    const out = runCli(argocdPath, buildAppSyncArgs(app, { server }), 300_000);
    return NextResponse.json({ ...plan, synced: true, output: out.trim() });
  } catch (err: unknown) {
    return NextResponse.json({ error: extractCliError(err, `Failed to sync ArgoCD app "${app}"`) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test "src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npx eslint "src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.ts"`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest"
git commit -m "feat(argocd): add sync-chart-latest route (floating targetRevision path)"
```

---

### Task 4: UI — dialog + button wiring (with inline login)

**Files:**
- Create: `src/components/argocd/argocd-sync-chart-dialog.tsx`
- Modify: `src/components/argocd/argocd-action-buttons.tsx`
- Modify: `src/app/clusters/[clusterId]/argocd/page.tsx` (pass chart props to the buttons)
- Modify: `src/app/clusters/[clusterId]/argocd/[appName]/page.tsx` (pass chart props to the buttons)

**Interfaces:**
- Consumes: `apiClient` from `src/lib/api-client`; `useSettingsStore` from `src/stores/settings-store`; `getArgoCDAppSourceSummary` from `src/lib/argocd/helpers`; the `sync-chart-latest` route; `/api/auth/argocd/login`.
- Produces: `ArgoCDSyncChartDialog` component; `ArgoCDActionButtons` gains optional props `chart?: string; chartVersion?: string`.

- [ ] **Step 1: Create the dialog**

Create `src/components/argocd/argocd-sync-chart-dialog.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useSettingsStore } from '@/stores/settings-store';
import { toast } from 'sonner';
import { Loader2, RefreshCw, LogIn } from 'lucide-react';

interface ArgoCDSyncChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: string;
  appName: string;
  namespace: string;
  chart: string;
  currentVersion?: string;
  onSynced?: () => void;
}

interface CheckResponse {
  chart: string;
  currentRevision: string;
  syncedRevision?: string;
  syncStatus?: string;
  updateAvailable: boolean;
  supported: boolean;
  reason?: string;
  needsLogin?: boolean;
  error?: string;
}

export function ArgoCDSyncChartDialog({
  open, onOpenChange, clusterId, appName, namespace, chart, currentVersion, onSynced,
}: ArgoCDSyncChartDialogProps) {
  const server = useSettingsStore((s) => s.authProviderConfigs['argocd']?.server);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/clusters/${encodeURIComponent(clusterId)}/argocd/apps/${encodeURIComponent(appName)}/sync-chart-latest`;

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsLogin(false);
    try {
      const res = await apiClient.post<CheckResponse>(url, { namespace, server, checkOnly: true });
      setCheck(res);
    } catch (err: unknown) {
      const anyErr = err as { status?: number; data?: CheckResponse; message?: string };
      if (anyErr?.status === 401 || anyErr?.data?.needsLogin) {
        setNeedsLogin(true);
      } else {
        setError(anyErr?.data?.reason || anyErr?.data?.error || anyErr?.message || 'Check failed');
      }
    } finally {
      setLoading(false);
    }
  }, [url, namespace, server]);

  useEffect(() => {
    if (open) void runCheck();
    else { setCheck(null); setError(null); setNeedsLogin(false); }
  }, [open, runCheck]);

  const handleLogin = async () => {
    if (!server) { toast.error('Set the ArgoCD server in Settings > Auth Providers first.'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/auth/argocd/login', { server, authMode: 'sso' });
      toast.success('Logged in to ArgoCD');
      await runCheck();
    } catch (err: unknown) {
      toast.error(`ArgoCD login failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiClient.post(url, { namespace, server, sync: true });
      toast.success(`${appName}: synced to latest chart`);
      onSynced?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync chart to latest — {appName}</DialogTitle>
          <DialogDescription>Chart <span className="font-mono">{chart}</span></DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>}

          {!loading && needsLogin && (
            <div className="space-y-2">
              <p className="text-muted-foreground">Not logged in to ArgoCD.</p>
              <Button size="sm" onClick={handleLogin}><LogIn className="h-4 w-4" /> Login to ArgoCD</Button>
            </div>
          )}

          {!loading && error && <p className="text-destructive">{error}</p>}

          {!loading && check && (
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Target revision</span>
                <span className="font-mono">{check.currentRevision || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Synced revision</span>
                <span className="font-mono">{check.syncedRevision || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <span className="font-mono">{check.updateAvailable ? 'Update available' : 'Up to date'}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSync} disabled={syncing || loading || !check?.updateAvailable}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Update &amp; Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the button to `ArgoCDActionButtons`**

In `src/components/argocd/argocd-action-buttons.tsx`:

1. Add to the imports at the top:

```tsx
import { ArrowUpCircle } from 'lucide-react';
import { ArgoCDSyncChartDialog } from '@/components/argocd/argocd-sync-chart-dialog';
```

2. Extend the props interface with:

```tsx
  chart?: string;
  chartVersion?: string;
```

3. Destructure `chart` and `chartVersion` in the component signature alongside the existing props, and add dialog state near the other `useState` calls:

```tsx
  const [syncChartOpen, setSyncChartOpen] = useState(false);
```

4. Immediately after the closing `</Button>` of the existing Sync button (before the closing `</div>`), add — rendered only for Helm chart apps:

```tsx
        {chart && (
          <Button
            variant="outline"
            size={compact ? 'xs' : 'sm'}
            onClick={() => setSyncChartOpen(true)}
            disabled={pending !== null}
            title="Sync chart to latest version"
          >
            <ArrowUpCircle className={iconClass} />
            {!compact && 'Sync to Latest'}
          </Button>
        )}
```

5. Immediately after the existing `<ConfirmDialog ... />` (before the closing `</>`), add:

```tsx
      {chart && (
        <ArgoCDSyncChartDialog
          open={syncChartOpen}
          onOpenChange={setSyncChartOpen}
          clusterId={clusterId}
          appName={appName}
          namespace={namespace}
          chart={chart}
          currentVersion={chartVersion}
          onSynced={onChanged}
        />
      )}
```

- [ ] **Step 3: Pass chart props from the detail page**

In `src/app/clusters/[clusterId]/argocd/[appName]/page.tsx`, the `<ArgoCDActionButtons ... />` at line ~128 is rendered where the app object is available via `getArgoCDAppSourceSummary`. Compute the Helm summary and pass props. Just before the JSX return where the buttons render, add (reuse the existing resolved app variable — it is the `ArgoCDApplication` used for `getArgoCDAppSourceSummary` elsewhere on the page):

```tsx
        const summary = getArgoCDAppSourceSummary(app);
        const helmChart = summary.type === 'Helm' ? summary.name : undefined;
        const helmVersion = summary.type === 'Helm' ? summary.revision : undefined;
```

(Place this where `app` is in scope; if the component already computes `getArgoCDAppSourceSummary(app)` into a variable, reuse it instead of recomputing.) Then update the props:

```tsx
        <ArgoCDActionButtons
          clusterId={decodedClusterId}
          appName={appName}
          namespace={resolvedNamespace}
          onChanged={() => mutate()}
          chart={helmChart}
          chartVersion={helmVersion}
        />
```

- [ ] **Step 4: Pass chart props from the list page**

In `src/app/clusters/[clusterId]/argocd/page.tsx`, the buttons render inside the Actions column at line ~132 where `app` is the row item. Update that render to derive and pass the Helm chart:

```tsx
        const summary = getArgoCDAppSourceSummary(app);
        return (
          <ArgoCDActionButtons
            clusterId={decodedClusterId}
            appName={name}
            namespace={namespace}
            onChanged={() => mutate()}
            compact
            chart={summary.type === 'Helm' ? summary.name : undefined}
            chartVersion={summary.type === 'Helm' ? summary.revision : undefined}
          />
        );
```

(`getArgoCDAppSourceSummary` is already imported on this page.)

- [ ] **Step 5: Verify build + lint**

Run: `npx eslint src/components/argocd/argocd-sync-chart-dialog.tsx src/components/argocd/argocd-action-buttons.tsx "src/app/clusters/[clusterId]/argocd/page.tsx" "src/app/clusters/[clusterId]/argocd/[appName]/page.tsx"`
Then: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual smoke test**

Run the app: `npm run dev` (or `npm run electron:dev`). Open an ArgoCD Helm-chart app; confirm a "Sync to Latest" button appears (list + detail), the dialog opens and runs a check, and a not-logged-in state shows the "Login to ArgoCD" button.

- [ ] **Step 7: Commit**

```bash
git add src/components/argocd "src/app/clusters/[clusterId]/argocd"
git commit -m "feat(argocd): add Sync-to-Latest chart dialog + button with inline login"
```

---

### Task 5: Pinned-version enumeration (spike + implement)

**Files:**
- Modify: `src/lib/argocd/sync-latest.ts` (add `resolveLatestChartVersion` interface + parse helper)
- Modify: `src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.ts` (wire pinned path)
- Test: extend `src/lib/argocd/sync-latest.test.ts`

**Spike goal:** determine how to list available chart versions for a pinned Helm-chart app, then implement it. KubeOps must not store credentials — reuse the CLI session.

- [ ] **Step 1: Investigate (record findings in a comment at the top of the new code)**

Run these against a real pinned Helm-chart app (replace `<app>`/`<server>`):

```bash
# Does app get expose available versions anywhere?
argocd app get <app> --server <server> -o json | less
# Where is the CLI session/token stored?
cat ~/.config/argocd/config
# Try the repo-server helmcharts listing via the API using the stored token.
# Read server + auth-token for the current context from ~/.config/argocd/config, then:
#   curl -sSk -H "Authorization: Bearer $TOKEN" \
#     "https://<server>/api/v1/repositories/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' '<repoURL>')/helmcharts"
```

Decision gate:
- **If `argocd app get -o json` (or another CLI command) lists versions** → parse it; no HTTP needed.
- **Else** → implement the HTTP call to the helmcharts endpoint, reading `server` + bearer token from `~/.config/argocd/config` for the matching context. Confirm the exact endpoint path from the investigation before coding.

- [ ] **Step 2: Write the failing test for the version parser**

Add to `src/lib/argocd/sync-latest.test.ts` (adjust the sample shape to match the investigation output):

```ts
import { parseAvailableChartVersions } from './sync-latest';

describe('parseAvailableChartVersions', () => {
  it('extracts and returns the versions list', () => {
    // Shape confirmed during the Task 5 spike; update this fixture to match.
    const raw = { items: [{ name: 'web', versions: ['1.2.3', '1.3.0', '1.2.9'] }] };
    assert.deepEqual(parseAvailableChartVersions('web', raw), ['1.2.3', '1.3.0', '1.2.9']);
  });
  it('returns an empty array when the chart is absent', () => {
    assert.deepEqual(parseAvailableChartVersions('web', { items: [] }), []);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test src/lib/argocd/sync-latest.test.ts`
Expected: FAIL — `parseAvailableChartVersions` not exported.

- [ ] **Step 4: Implement the parser + resolver**

Add to `src/lib/argocd/sync-latest.ts` (shape per spike; this is the helmcharts-endpoint form):

```ts
interface HelmChartsResponse {
  items?: Array<{ name?: string; versions?: string[] }>;
}

export function parseAvailableChartVersions(chart: string, raw: unknown): string[] {
  const data = raw as HelmChartsResponse;
  const entry = (data.items || []).find((i) => i.name === chart || i.name?.split('/').pop() === chart);
  return entry?.versions ?? [];
}
```

Then wire the pinned path in the route: replace the `pinned` branch of `planChartSync` so it accepts an optional resolved `latest` version, and in `POST`, when `plan.pinned`, resolve versions (via the mechanism chosen in Step 1), compute `latest = selectLatestVersion(versions)`, set `updateAvailable = isChartUpdateAvailable(source.targetRevision, latest)`, and — when applying — run `buildAppSetRevisionArgs(app, latest)` before `buildAppSyncArgs(app)`. Read the ArgoCD bearer token from `~/.config/argocd/config` (never store it); if enumeration fails, return `{ supported: false, reason: '<message>' }`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test src/lib/argocd/sync-latest.test.ts "src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest/route.test.ts"`
Expected: PASS.

- [ ] **Step 6: Manual verification on a pinned app**

With a pinned Helm-chart app that has a newer version available, open the dialog: it should show current → latest and enable "Update & Sync"; after syncing, `argocd app get <app>` should show the bumped `targetRevision`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/argocd/sync-latest.ts src/lib/argocd/sync-latest.test.ts "src/app/api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest"
git commit -m "feat(argocd): resolve + sync latest version for pinned chart apps"
```

---

### Task 6: Docs — add `argocd` to optional CLIs

**Files:**
- Modify: `README.md` (Requirements section, optional CLI list)

- [ ] **Step 1: Add the optional dependency line**

In `README.md`, in the "Requirements" list of optional CLIs (next to the `helm`, `tsh`, `aws` lines), add:

```markdown
- *(Optional)* **argocd** CLI for ArgoCD login and chart "Sync to Latest" (delegates auth to your `argocd login` session)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: note argocd CLI as an optional dependency"
```

---

## Self-Review

**1. Spec coverage:**
- ArgoCD login as auth provider (login from UI) → Task 2. ✅
- Cluster → server mapping via `authProviderConfigs` → Task 2 (config field) + Task 4 (dialog reads `authProviderConfigs['argocd'].server`). ✅
- sync-chart-latest route + check-only → Task 3. ✅
- Helpers/version logic → Task 1. ✅
- Dialog + button (Helm-only) + inline login → Task 4. ✅
- Spike / pinned enumeration → Task 5. ✅
- argocd not installed → 503; session expired → needsLogin/inline login → Tasks 3 + 4. ✅
- Not a Helm chart source → button hidden (Task 4) + route 400 (Task 3). ✅
- Tests → each task. ✅
- README optional CLI → Task 6. ✅
- Out of scope (Git apps, token storage, HTTP-API B2, bulk sync, multi-source) → respected. ✅

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" without code. Task 5's fixture shape is explicitly marked "confirm during spike" because it depends on a real API response — this is a genuine investigation gate, not a hidden placeholder; the interface and fallback are fully specified.

**3. Type consistency:** `ChartSyncPlan`, `ArgoCDChartSource`, arg-builder names, and `authProviderConfigs['argocd'].server` are used identically across Tasks 1/3/4/5. Provider `id: 'argocd'` matches the route param `providerId` used by `/api/auth/argocd/login`.
