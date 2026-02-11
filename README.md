# KubeOps

**KubeOps** is a modern desktop client for Kubernetes cluster management. Built with Electron, Next.js, and Tailwind CSS, it provides a fast, visual interface for navigating resources, debugging pods, and monitoring workloads — all from your local kubeconfig.

![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)

---

## Getting Started

### Prerequisites

- **Node.js** v18+
- A valid `~/.kube/config` with at least one context

### Run from Source

```bash
git clone https://github.com/trustspirit/kubeops.git
cd kubeops
npm install
npm run electron:dev
```

### Build for Distribution

| Platform | Command |
|----------|---------|
| macOS | `npm run electron:build:mac` |
| Windows | `npm run electron:build:win` |
| Linux | `npm run electron:build:linux` |

---

## Features

### Cluster Overview

On launch, KubeOps auto-detects all clusters from your kubeconfig. Select a cluster to see a dashboard with:

- Node and pod counts with health status
- Pod status distribution (pie chart)
- Workload health across Deployments, StatefulSets, DaemonSets
- CPU usage per node (bar chart)
- Active services with quick port-forward buttons
- Ingress endpoints with external links
- Recent warning events and top-restarting pods

### Resource Navigation

Use the sidebar to browse **24 resource types** organized into sections:

| Section | Resources |
|---------|-----------|
| **Cluster** | Overview, App Map, Nodes, PVs, ClusterRoles, ClusterRoleBindings |
| **Workloads** | Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs |
| **Network** | Services, Ingresses, Endpoints, NetworkPolicies, Port Forwarding |
| **Configuration** | ConfigMaps, Secrets, ServiceAccounts |
| **Storage** | PersistentVolumeClaims |
| **Access Control** | Roles, RoleBindings |
| **Events** | Events |

Each resource list features searchable, sortable tables with status badges and relative age display. Click any resource to open its detail page.

### Resource Detail Pages

Every resource detail page provides:

- **Overview tab** — Metadata, labels, annotations, and kind-specific information
- **YAML tab** — View and edit the resource manifest with three modes:
  - **Table view**: Structured, collapsible sections with smart value rendering
  - **YAML view**: Read-only formatted output
  - **Edit mode**: Syntax-highlighted editor with validation, save with `Cmd+S`
- **Delete** button with confirmation dialog

Workload resources (Deployments, StatefulSets, DaemonSets) also include a **Scale** dialog to adjust replica counts.

### Pod Details

Pod detail pages include additional features:

- **Container info**: State, image, ports, resource limits, volume mounts, environment variables
- **Environment variable resolver**: Resolves values from ConfigMaps, Secrets, and field refs — with obfuscated secrets (click to reveal)
- **Metrics charts**: Real-time CPU, memory, network I/O, and filesystem I/O (requires metrics-server; Prometheus optional for network/filesystem)
- **Resource tree**: Visual hierarchy showing the pod's owner chain (Deployment → ReplicaSet → Pod)
- Action buttons: **Exec**, **Logs**, **Watch**

### App Map

Navigate to **App Map** in the sidebar to see a visual topology of all resources in the current namespace.

- Interactive flowchart showing relationships: Ingress → Service → Deployment → ReplicaSet → Pod
- Auto-layout with pan, zoom, and fit-to-view controls
- Each node displays kind, name, health status, and summary info
- Two action buttons per node:
  - **Detail** (arrow icon) — Navigate to the resource detail page
  - **Info** (info icon) — Open a quick-info drawer without leaving the map

### Resource Info Drawer

Clicking the info icon on any App Map node opens a right-side drawer with:

- **Overview tab**: Key metadata, kind-specific status (replicas, containers, ports, IPs), and labels
- **Events tab**: Related Kubernetes events sorted by severity — warnings and unhealthy events (CrashLoopBackOff, ImagePullBackOff, OOMKilled, etc.) are highlighted and shown first, with a summary badge
- **Footer actions**:
  - "Detail Page" button to navigate to the full resource view
  - "View Logs" button (pods only) — opens logs in the bottom panel and closes the drawer

### Terminal & Logs Panel

A resizable bottom panel supports multiple concurrent sessions:

- **Terminal** — Full PTY-based shell into any container via `kubectl exec`. Supports keyboard input, resizing, and standard terminal behavior.
- **Logs** — Real-time log streaming with pause/follow toggle, jump-to-bottom, and log download.

Sessions persist as tabs across page navigation. Open new sessions from pod detail pages or the resource info drawer.

### Port Forwarding

Start port forwards from:
- Pod container port buttons
- Service ports on the cluster overview
- YAML editor port fields

Manage all active forwards from the **Port Forwarding** page:
- View status (starting / active / error)
- Open forwarded port in browser
- Stop individual forwards

### Pod Restart Watcher

Enable **Watch** on any pod to monitor restart counts in the background:

- Polls every 10 seconds
- Sends a desktop notification when restarts increase
- Watched pods persist across sessions (localStorage)
- Toggle notifications in Settings

### Command Palette

Press `Cmd+K` (or `Ctrl+K`) to open a fuzzy-search palette. Quickly jump to:
- Clusters (with connection status)
- Namespaces
- Any resource type

### Namespace Selector

Switch namespaces from the header dropdown. Choose **All Namespaces** to see cross-namespace resources. The active namespace is remembered per cluster.

### Theme

Toggle between light and dark mode from the header. Follows system preference by default.

### Settings

Access settings from the gear icon in the header:

- **Teleport (tsh)**: Configure proxy URL and auth type for Teleport-based cluster access
- **Notifications**: Enable or disable desktop notifications for pod restart alerts

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `Cmd+S` / `Ctrl+S` | Save YAML in edit mode |

---

## Architecture

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS |
| State | Zustand (persisted to localStorage) |
| Data fetching | SWR with auto-refresh |
| K8s API | `@kubernetes/client-node` via Next.js API routes |
| Terminal | xterm.js + node-pty over WebSocket |
| Charts | Recharts |
| Resource graph | React Flow + Dagre |
| YAML | js-yaml |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No clusters found" | Verify `~/.kube/config` is valid — run `kubectl config get-contexts` |
| Connection refused | Restart the app or check if port 3000 is in use |
| Metrics charts empty | Ensure `metrics-server` is installed in the cluster |
| Network/FS charts missing | Requires Prometheus with `container_network_*` and `container_fs_*` metrics |
| Port forward fails | Check that `kubectl` is on your PATH and the target pod is running |
