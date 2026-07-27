# v0.6.0 — ArgoCD Login & Chart Sync

## What's New

- Added ArgoCD as an authentication provider: log in to your ArgoCD server (SSO browser flow) directly from KubeOps via the `argocd` CLI — no terminal needed. Auth is delegated to your `argocd login` session; KubeOps stores no tokens.
- Added a "Sync to Latest" action for ArgoCD Applications backed by a Helm chart, on both the Applications list and the app detail page. It checks whether the app is out of sync and, on confirmation, triggers an ArgoCD sync.
- The sync dialog shows current vs. target revision and offers inline ArgoCD login when the CLI session is missing.
- CLI arguments derived from user input are validated to prevent argv flag smuggling.

## Notes

- Applications with a floating `targetRevision` (e.g. `1.2.*`, ranges) are fully supported. Applications pinned to an exact chart version currently show an informational "not yet supported" message; bumping a pinned version to the latest is planned for a follow-up.
- Requires the optional `argocd` CLI on your `PATH`.

# v0.4.6 — Helm Sync Latest

## What's New

- Added Helm release sync actions that upgrade a release to the latest chart version from configured Helm repositories.
- Added release-level sync entry points from the Helm list and detail pages.
- Added Pod-to-Helm-release navigation when Helm metadata can identify the owning release.
- Added a Cluster overview shortcut to Helm releases.
- Skips Helm upgrade when the release is already on the latest detected chart version.

# v0.3.0 — Multi-Provider Authentication

## Highlights

KubeOps now supports **6 authentication providers** out of the box. No more switching to the terminal to re-authenticate — KubeOps detects your cluster's auth provider from kubeconfig and handles login directly.

### Supported Providers

| Provider | CLI | What it does |
|----------|-----|-------------|
| **Teleport** | `tsh` | Proxy login + per-cluster `kube login` |
| **AWS EKS (SSO)** | `aws` | SSO browser login + kubeconfig update |
| **AWS EKS (IAM)** | `aws` / `aws-iam-authenticator` | Credential verification |
| **OIDC** | `kubelogin` | Browser-based OIDC token refresh |
| **Google GKE** | `gcloud` | Google auth + cluster credentials |
| **Azure AKS** | `az` | Azure login + AKS credentials |

## What's New

### Multi-Provider Auth Framework
- **Auto-detection**: Analyzes kubeconfig `exec` commands and server URLs to identify which provider manages each cluster
- **Unified Settings**: New **Authentication** tab in Settings shows all providers with install status and configuration fields
- **Header login buttons**: Only installed providers appear in the header, showing logged-in username when authenticated
- **Provider-aware cluster login**: Clicking a disconnected cluster routes to the correct provider automatically
- **Provider-aware error recovery**: Auth error pages show a login button for the detected provider

### Architecture
- Provider-per-module pattern with common `AuthProvider` interface
- Unified API routes (`/api/auth/[providerId]/status`, `/api/auth/[providerId]/login`)
- Safe CLI execution via `execFileSync` (no shell injection)
- Input validation on all API endpoints
- Legacy `/api/tsh/*` routes preserved for backward compatibility

## Screenshots

### Cluster page with provider login status
![Clusters](docs/screenshots/clusters-page-auth-buttons.png)

### Authentication providers in Settings
![Settings Auth](docs/screenshots/settings-auth-providers.png)

### Provider-specific configuration
![Provider Config](docs/screenshots/settings-auth-provider-config.png)

## Breaking Changes

- The Teleport (tsh) configuration has moved from **Settings > General** to **Settings > Authentication**. Existing settings are preserved in localStorage.

## Requirements

No new required dependencies. Auth providers are optional — install the CLI tools for the providers you use:

```bash
# AWS EKS
brew install awscli

# Google GKE
brew install google-cloud-sdk

# Azure AKS
brew install azure-cli

# OIDC
kubectl krew install oidc-login

# Teleport
brew install teleport
```
