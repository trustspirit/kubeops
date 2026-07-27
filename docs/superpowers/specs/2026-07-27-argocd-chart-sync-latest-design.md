# ArgoCD Chart "Sync to Latest" + In-UI ArgoCD Login — Design

- Date: 2026-07-27
- Status: Approved (design), pending implementation plan
- Author: young (with Claude)

## Problem

KubeOps already has an ArgoCD Applications view. It reads/patches `argoproj.io/v1alpha1/Application`
custom resources **directly via the Kubernetes API** of the selected kubeconfig context
(`src/app/api/clusters/[clusterId]/crds/[...path]/route.ts` → `@kubernetes/client-node`). It does
**not** talk to the ArgoCD API server. The existing `ArgoCDActionButtons` (Refresh / Hard Refresh /
Sync) trigger a reconcile against the Application's **already-declared** `targetRevision`; they do
not move the app to a newer chart version.

We want: **when a connected Helm chart has a newer version available, detect it and sync the
Application to the latest version** (i.e. bump `targetRevision` to the newest chart version and sync).

Native ArgoCD "Sync" does not bump versions for pinned `targetRevision` (e.g. `1.2.3`); it only
resolves the newest matching version automatically when `targetRevision` is a floating semver range
(e.g. `1.2.*`, `>=1.0.0`). So for pinned apps KubeOps must resolve the latest version and update the
app.

## Key decision: talk to ArgoCD via the `argocd` CLI (delegated auth)

Detecting available chart versions requires the chart repo's credentials. ArgoCD holds those in its
repo-server; the local `helm` CLI does not. Therefore we integrate with the **ArgoCD server**
(e.g. `argocd-root.ovdr.io`) rather than resolving versions locally.

We do this via the **`argocd` CLI** (not raw HTTP API), consistent with KubeOps's existing philosophy
of delegating to user-installed optional CLIs (kubectl, helm, tsh, aws, gcloud, az, kubelogin). The
CLI owns auth, SSO, server URL, network reachability (Teleport/VPN), and session storage
(`~/.config/argocd/config`). KubeOps stores **no** ArgoCD tokens.

Rejected alternatives:
- **A. Local `helm` CLI enumeration** — fails for private repos (no credentials locally).
- **B2. Raw HTTP API to ArgoCD server** — KubeOps would become the only feature storing/managing
  sensitive tokens; more code; inconsistent with the CLI-delegation model.

## Architecture

### 1. ArgoCD login as a new Auth Provider (login runs from the UI)

KubeOps has a generic auth-provider framework: `AuthProvider` interface (`src/lib/auth/types.ts`),
registry (`src/lib/auth/registry.ts`), generic routes `/api/auth/[providerId]/login` and
`/api/auth/[providerId]/status`, and a generic Settings UI (`auth-providers-tab.tsx`). The tsh
provider's `login()` already spawns an SSO browser flow (`tsh login --proxy=... --auth=...`) directly
from a UI button click — no terminal needed.

Add an ArgoCD provider that plugs into the same framework:

- **New** `src/lib/auth/argocd/provider.ts` implementing `AuthProvider` (mirrors
  `src/lib/auth/tsh/provider.ts`):
  - `id: 'argocd'`, `name: 'ArgoCD'`, `icon` (lucide name).
  - `checkAvailability()`: `findCli('argocd')` + version.
  - `getStatus(config)`: `argocd account get-user-info -o json --server <url>` (fallback:
    `argocd context`) → `{ authenticated, user }`. Preserve-last-status TTL pattern like tsh to
    avoid UI flicker.
  - `login(config)`: spawn `argocd login <server> --sso` (browser SSO). Support username/password
    mode (`--username`/`--password`) and optional `--grpc-web` via config. Long timeout (~120s)
    like tsh SSO.
  - `getConfigFields()`: `server` (e.g. `argocd-root.ovdr.io`), `authMode` (select: sso |
    username-password), optional `grpcWeb` (select), optional `username`.
- Register it: add `registerProvider(argocdProvider)` in `src/lib/auth/providers.ts`. It then
  appears automatically in Settings > Auth Providers.
- **Cluster → ArgoCD server mapping**: reuse the existing `authProviderConfigs` + per-cluster
  override pattern in `src/stores/settings-store.ts` (e.g. central-ea → `argocd-root.ovdr.io`).

### 2. "Sync chart to latest" feature

- **API route** `POST /api/clusters/[clusterId]/argocd/apps/[appName]/sync-chart-latest`
  (plus a check-only mode: same route with `{ checkOnly: true }` or a sibling `GET`).
  - Reuse `src/lib/auth/cli-utils.ts` (`findCli('argocd')`, `runCli`, `extractCliError`) to spawn
    the CLI. **No separate argocd-runner module** (simplification).
  - Input: `namespace`, optional `appNamespace`/`project`, optional `version` override, `sync`
    (bump-only vs bump+sync), `checkOnly`.
  - Flow:
    1. Guard: argocd installed? else 503 with install hint.
    2. `argocd app get <app> -o json --server <url>` → current chart, repoURL, `targetRevision`,
       synced revision, source type (single vs multi-source).
    3. Resolve latest available version (see spike below).
    4. If latest == current → return `{ skipped: true }` ("already up to date").
    5. If `checkOnly` → return `{ current, latest, updateAvailable }` (powers UI badge/preview).
    6. For pinned apps: `argocd app set <app> --revision <latest>`. For range apps: skip set
       (ArgoCD already resolves latest on refresh).
    7. Unless bump-only: `argocd app sync <app>`.
    8. Return result.
- **Helpers** `src/lib/argocd/sync-latest.ts`: parse `argocd app get` JSON, semver compare,
  `selectLatestChartVersion`, `isChartUpdateAvailable`, arg builders. Reuse/extract shared semver
  logic from `src/lib/helm/sync-latest.ts` (`isSameChartVersion`, `getChartVersion`,
  `selectLatestChartSearchResult`) into a common util where practical.
- **UI** `src/components/argocd/argocd-sync-chart-dialog.tsx` (mirrors
  `src/components/helm/helm-sync-latest-dialog.tsx`): shows current → latest, "up to date" /
  "update available", `Update & Sync` (and optionally "Update revision only").
  - Entry point: add a button to `src/components/argocd/argocd-action-buttons.tsx`, shown **only for
    Helm-chart-sourced apps**. Rendered in both the list Actions column (compact) and the detail
    header, alongside existing buttons.
  - **Not-logged-in handling**: if ArgoCD status is unauthenticated, the dialog shows an inline
    "Login to ArgoCD" button that calls `/api/auth/argocd/login` (browser SSO) — instead of telling
    the user to open a terminal.

## Spike (do first in implementation): enumerate available versions for pinned apps

The one real unknown is enumerating available chart versions for a pinned `targetRevision` app.

- Floating range `targetRevision`: `argocd app get --refresh` makes ArgoCD resolve the newest
  matching version (`status.sync.revision`); no enumeration needed — just sync.
- Pinned `targetRevision`: if the `argocd` CLI has no direct "list chart versions" command, call the
  ArgoCD server's helmcharts endpoint, **reusing the CLI session/token** (read from
  `~/.config/argocd/config` or obtain via the CLI) so we still store no credentials and only use
  HTTP for the enumeration step. Confirm exact mechanism before building the pinned path; scope the
  pinned-version support to the spike outcome.

## Error handling

- `argocd` not installed → 503 with install hint (mirror `requireHelm`).
- Session expired / not logged in → surface via the in-dialog "Login to ArgoCD" button; API returns
  a clear error parsed from CLI stderr.
- App is not a Helm chart source → button hidden; route returns 400 if called directly.
- Multi-source apps → target the chart source(s); ambiguous cases resolved per spike.

## Testing

- Unit tests for `src/lib/argocd/sync-latest.ts` (version selection, update detection, arg building)
  — mirror `src/lib/argocd/helpers.test.ts` and `helm/sync-latest` tests.
- Route tests with `cli-utils`/argocd CLI mocked.
- Provider `getStatus`/`login` arg-construction tests (mirror tsh provider tests where they exist).

## Documentation

- Add `argocd` to the optional-CLI list in `README.md`.

## Out of scope (YAGNI)

- Git-source apps (no chart version concept).
- KubeOps storing ArgoCD tokens (delegated to CLI).
- Raw HTTP API integration (B2).
- Bulk "sync all apps to latest".
