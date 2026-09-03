import type { ChildProcess } from 'child_process';

export interface PortForwardInfo {
  id: string;
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  containerPort: number;
  localPort: number;
  status: 'starting' | 'active' | 'error';
  error?: string;
  pid?: number;
}

export interface PortForwardEntry {
  info: PortForwardInfo;
  proc: ChildProcess;
}

interface Registry {
  forwards: Map<string, PortForwardEntry>;
  exitHookInstalled: boolean;
}

const REGISTRY_KEY = Symbol.for('kubeops.portForwardRegistry');

/**
 * The registry lives on `globalThis` on purpose.
 *
 * The production server is an esbuild bundle while the API route is loaded by
 * Next from `.next/server`, so a plain module-level `Map` exists twice: the
 * shutdown hook would look at an empty copy and leave every `kubectl
 * port-forward` child running after the app quits.
 */
function registry(): Registry {
  const store = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  if (!store[REGISTRY_KEY]) {
    store[REGISTRY_KEY] = { forwards: new Map(), exitHookInstalled: false };
  }
  const value = store[REGISTRY_KEY];

  // Belt and braces: even if no explicit shutdown path runs, don't outlive the
  // server process.
  if (!value.exitHookInstalled) {
    value.exitHookInstalled = true;
    process.once('exit', () => killAllForwards());
  }

  return value;
}

export function getForwards(): Map<string, PortForwardEntry> {
  return registry().forwards;
}

/** Kill every running port-forward child. Safe to call more than once. */
export function killAllForwards(): void {
  const forwards = registry().forwards;
  for (const [, { proc }] of forwards) {
    try { proc.kill(); } catch { /* already stopped */ }
  }
  forwards.clear();
}
