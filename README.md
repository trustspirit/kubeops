<p align="center">
  <img src="resources/icon.png" alt="KubeOps" width="128" height="128" />
</p>

<h1 align="center">KubeOps</h1>

<p align="center">
  A modern desktop client for Kubernetes — navigate clusters, debug pods, and manage workloads with a visual interface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
</p>

---

## Why KubeOps?

- **Zero config** — Reads your `~/.kube/config` and auto-detects every cluster. No setup, no YAML to write.
- **Visual topology** — See how Ingresses, Services, Deployments, and Pods connect in an interactive App Map.
- **Built-in terminal & logs** — Open shell sessions and live log streams right inside the app. No more switching between terminal tabs.
- **Port forwarding dashboard** — Start, monitor, and stop port forwards from a single page.
- **Real-time metrics** — CPU, memory, network I/O, and filesystem charts per pod (with metrics-server / Prometheus).
- **ArgoCD-style status** — Health badges on every resource so you can spot problems at a glance.
- **Fast keyboard navigation** — Command palette (`Cmd+K`) to jump to any cluster, namespace, or resource type instantly.
- **Cross-platform** — Runs natively on macOS, Windows, and Linux.

---

## Features

### Cluster Overview Dashboard

Auto-detects all clusters from kubeconfig. Select a cluster to see node/pod counts, pod status distribution, workload health, CPU usage per node, active services with port-forward buttons, ingress endpoints, and recent warning events.

<!-- Screenshot: Cluster Overview -->
> _Screenshot: Cluster overview dashboard showing node health, pod distribution chart, and workload status cards_

### App Map (Resource Topology)

Interactive flowchart visualizing resource relationships: Ingress → Service → Deployment → ReplicaSet → Pod. Auto-layout with pan, zoom, and fit-to-view. Each node shows kind, name, health status, and summary info with Detail and Info action buttons.

<!-- Screenshot: App Map -->
> _Screenshot: App Map view showing connected resources in a visual topology graph_

### Live Status Display

Every resource list features searchable, sortable tables with health status badges and relative age display. Warnings and unhealthy states (CrashLoopBackOff, ImagePullBackOff, OOMKilled) are highlighted and surfaced first.

<!-- Screenshot: Resource List -->
> _Screenshot: Resource list with status badges, search, and sortable columns_

### Pod Terminal & Logs

A resizable bottom panel supports multiple concurrent sessions as tabs. Full PTY-based terminal via `kubectl exec` with keyboard input and resizing. Real-time log streaming with pause/follow toggle, jump-to-bottom, and download. Sessions persist across page navigation.

<!-- Screenshot: Terminal & Logs -->
> _Screenshot: Split view with terminal session and live log streaming in bottom panel tabs_

### Port Forwarding

Start port forwards from pod container ports, service ports, or YAML editor fields. Manage all active forwards from the Port Forwarding page — view status (starting / active / error), open in browser, or stop individually.

<!-- Screenshot: Port Forwarding -->
> _Screenshot: Port forwarding management page with active forwards and status indicators_

### YAML Editor (Table / YAML / Edit)

Three viewing modes for every resource manifest:
- **Table view** — Structured, collapsible sections with smart value rendering
- **YAML view** — Read-only formatted output
- **Edit mode** — Syntax-highlighted editor with validation, save with `Cmd+S`

<!-- Screenshot: YAML Editor -->
> _Screenshot: YAML editor in edit mode with syntax highlighting and validation_

### Command Palette

Press `Cmd+K` (or `Ctrl+K`) to open a fuzzy-search palette. Quickly jump to clusters (with connection status), namespaces, or any resource type.

<!-- Screenshot: Command Palette -->
> _Screenshot: Command palette open with search results for clusters and resources_

### Resource Info Drawer

Click the info icon on any App Map node to open a right-side drawer with Overview (metadata, status, labels), Events (sorted by severity with warning highlights), and footer actions to navigate to detail pages or open logs.

<!-- Screenshot: Resource Info Drawer -->
> _Screenshot: Info drawer open over App Map showing resource overview and events tabs_

### Pod Restart Watcher

Enable Watch on any pod to monitor restart counts in the background. Polls every 10 seconds and sends desktop notifications when restarts increase. Watched pods persist across sessions.

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

The app opens automatically once the dev server is ready (port 51230).

---

## Build

Create a distributable package for your platform:

| Platform | Command |
|----------|---------|
| macOS | `npm run electron:build:mac` |
| Windows | `npm run electron:build:win` |
| Linux | `npm run electron:build:linux` |

Output is written to `dist-electron/`.

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

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `Cmd+S` / `Ctrl+S` | Save YAML in edit mode |

---

## Error Logs

KubeOps automatically captures errors and writes them to a log file so you can diagnose issues even without DevTools.

**What gets logged:**

- Main process crashes (uncaught exceptions, unhandled rejections)
- Renderer process crashes and `console.error()` output
- Production server stderr and unexpected exits
- Startup failures

**Log location:**

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/KubeOps/logs/error.log` |
| Windows | `%APPDATA%\KubeOps\logs\error.log` |
| Linux | `~/.config/KubeOps/logs/error.log` |

**Accessing logs from the app:**

Use the **Help** menu:

| Menu Item | Action |
|-----------|--------|
| Open Error Log | Opens the log file in your default text editor |
| Show Log Folder | Opens the log directory in Finder / Explorer |
| Export Error Log… | Save a copy to a location of your choice |

Logs rotate automatically at 5 MB (previous log kept as `error.log.old`).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No clusters found" | Verify `~/.kube/config` is valid — run `kubectl config get-contexts` |
| Connection refused | Restart the app or check if port 51230 is in use |
| Metrics charts empty | Ensure `metrics-server` is installed in the cluster |
| Network/FS charts missing | Requires Prometheus with `container_network_*` and `container_fs_*` metrics |
| Port forward fails | Check that `kubectl` is on your PATH and the target pod is running |
| Diagnosing crashes | Open **Help → Open Error Log** to see captured errors |
