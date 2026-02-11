# KubeOps

**KubeOps** is a modern, powerful desktop client for Kubernetes, designed to simplify cluster management and monitoring. Built with **Electron**, **Next.js**, and **Tailwind CSS**, it offers a sleek, high-performance interface for DevOps engineers and developers.

## Features

- **🚀 Multi-Context Support**: Seamlessly switch between different Kubernetes clusters defined in your local `~/.kube/config`. No manual configuration required.
- **⚡ Real-Time Monitoring**: View live status updates for Pods, Deployments, Services, and other resources.
- **💻 Interactive Terminal**: Execute commands directly into your running pods with a fully functional, integrated terminal.
- **📄 Log Streaming**: Stream container logs in real-time to debug issues instantly.
- **🛠️ Comprehensive Resource View**: Drill down into Namespaces, Nodes, specialized workloads (DaemonSets, StatefulSets, Jobs), and configuration (ConfigMaps, Secrets).

## Installation

### Prerequisites

- **Node.js**: Verify you have Node.js installed (v18+ recommended).
- **Kubeconfig**: Ensure you have a valid `~/.kube/config` file accessible.

### Running from Source

To run KubeOps locally for development or testing:

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/trustspirit/kubeops.git
    cd kubeops
    ```

2.  **Install dependencies**:

    ```bash
    npm install
    ```

3.  **Start the application**:
    ```bash
    npm run electron:dev
    ```
    This command starts both the Next.js development server and the Electron window.

### Building the App

To build a production-ready application for your OS:

- **macOS**: `npm run electron:build:mac`
- **Windows**: `npm run electron:build:win`
- **Linux**: `npm run electron:build:linux`

The output binaries will be located in the `dist` or `release` directory (depending on configuration).

## Usage Guide

1.  **Connect to a Cluster**:
    - Upon launch, KubeOps automatically detects clusters from your default kubeconfig.
    - Click on a cluster card to connect.

2.  **Navigate Resources**:
    - Use the sidebar to explore Namespaces, Nodes, Workloads, Network, and Storage resources.
    - Click on a specific resource to view details.

3.  **Interact with Pods**:
    - Navigate to **Workloads > Pods**.
    - Select a pod to view its details.
    - Click the **Exec** tab to open a terminal session inside the container.
    - Click the **Logs** tab to view real-time logs.

## Troubleshooting

- **"No clusters found"**: Ensure your `~/.kube/config` is valid and contains at least one context. You can verify this by running `kubectl config get-contexts` in your terminal.
- **Connection Refused**: If the app fails to connect to the local server, try restarting the application or checking if port 3000 is occupied.
