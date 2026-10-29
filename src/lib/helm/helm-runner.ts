import { execFile, spawn } from 'child_process';
import { resolveCli } from '../cli-path';
import { HELM_TIMEOUT_EXIT_CODE } from './errors';

export { HELM_TIMEOUT_EXIT_CODE };

const helmPath = resolveCli('helm');

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Budget handed to helm itself (`--timeout`) for install/upgrade/rollback/
 * uninstall. It must be shorter than our own runner timeout: if we stop
 * waiting first, helm is cut off mid-operation and the release is left in
 * `pending-*`, which blocks every later operation on it.
 */
export const HELM_OPERATION_TIMEOUT_SECONDS = 100;

/** Extra time past helm's own --timeout before we stop waiting for the process. */
const MUTATION_GRACE_MS = 20_000;

/**
 * After we stop waiting, how long helm may keep running before it gets a
 * SIGTERM. Helm records the release outcome on its own timeout, so we leave it
 * alone well past that point and never SIGKILL a mutating command.
 */
const MUTATION_ORPHAN_TERM_MS = 5 * 60_000;

export const HELM_MUTATION_TIMEOUT_MESSAGE =
  'Helm did not finish in time. The operation may still be running — check the release history before retrying.';

export interface HelmResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface RunOptions {
  /**
   * Mutating commands are never killed quickly: on timeout we resolve with
   * HELM_MUTATION_TIMEOUT_MESSAGE and let helm finish so the release is not
   * left half-applied.
   */
  mutating?: boolean;
}

export async function runHelm(
  args: string[],
  kubeContext?: string,
  timeoutMs = DEFAULT_TIMEOUT,
  { mutating = false }: RunOptions = {},
): Promise<HelmResult> {
  const fullArgs = kubeContext ? ['--kube-context', kubeContext, ...args] : args;
  return new Promise((resolve) => {
    const proc = spawn(helmPath, fullArgs, { env: process.env });
    let stdout = '';
    let stderr = '';
    let finished = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
    };

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      if (mutating) {
        // Stop waiting, but let helm reach its own --timeout and record the
        // outcome. Only terminate a process that is truly stuck, much later.
        killTimer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } }, MUTATION_ORPHAN_TERM_MS);
        killTimer.unref?.();
        resolve({ stdout, stderr: HELM_MUTATION_TIMEOUT_MESSAGE, code: HELM_TIMEOUT_EXIT_CODE });
        return;
      }
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 5000);
      resolve({ stdout, stderr: 'Command timed out', code: HELM_TIMEOUT_EXIT_CODE });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (!finished) {
        finished = true;
        cleanup();
        resolve({ stdout, stderr, code: code ?? 1 });
      }
    });

    proc.on('error', (err) => {
      if (!finished) {
        finished = true;
        cleanup();
        resolve({ stdout, stderr: err.message, code: 1 });
      }
    });
  });
}

/**
 * Inserts flags before a `--` separator (flags after it would be read as
 * positionals), or appends them when there is none.
 */
export function insertHelmFlags(args: string[], flags: string[]): string[] {
  const dash = args.indexOf('--');
  if (dash === -1) return [...args, ...flags];
  return [...args.slice(0, dash), ...flags, ...args.slice(dash)];
}

/**
 * Runs install/upgrade/rollback/uninstall with helm's own `--timeout` set
 * below our runner timeout, so helm — not us — decides when to give up and
 * records the release status accordingly.
 */
export function runHelmMutation(args: string[], kubeContext?: string): Promise<HelmResult> {
  const withTimeout = args.includes('--timeout')
    ? args
    : insertHelmFlags(args, ['--timeout', `${HELM_OPERATION_TIMEOUT_SECONDS}s`]);
  return runHelm(withTimeout, kubeContext, HELM_OPERATION_TIMEOUT_SECONDS * 1000 + MUTATION_GRACE_MS, { mutating: true });
}

/** A found helm stays found; a missing one is re-checked so installing it later works without a restart. */
const MISSING_RECHECK_MS = 30_000;
let helmAvailable: { value: boolean; at: number } | null = null;
let helmCheckInFlight: Promise<boolean> | null = null;

export async function isHelmAvailable(): Promise<boolean> {
  if (helmAvailable && (helmAvailable.value || Date.now() - helmAvailable.at < MISSING_RECHECK_MS)) {
    return helmAvailable.value;
  }
  if (!helmCheckInFlight) {
    helmCheckInFlight = new Promise<boolean>((resolve) => {
      // execFile, not exec: no shell means no interpolation of helmPath.
      execFile(helmPath, ['version', '--short'], { encoding: 'utf-8', timeout: 5000 }, (err) => {
        resolve(!err);
      });
    }).then((value) => {
      helmAvailable = { value, at: Date.now() };
      helmCheckInFlight = null;
      return value;
    });
  }
  return helmCheckInFlight;
}

/** Validate a helm resource name (release name, repo name, etc.) */
export function isValidHelmName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(name);
}

/** Validate a Kubernetes namespace name (DNS-1123 label) */
export function isValidNamespace(ns: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(ns);
}

/** Validate a chart reference (repo/chart, OCI URL, or local path — must not start with -) */
export function isValidChartRef(chart: string): boolean {
  return chart.length > 0 && chart.length <= 512 && !chart.startsWith('-');
}

/** Validate a release revision: a positive integer (as number or digit string). */
export function parseRevision(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d{1,15}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

/** Validate a helm repo URL */
export function isValidRepoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'oci:';
  } catch {
    return false;
  }
}

/** Sanitize search keyword by removing dangerous shell characters */
export function sanitizeSearchKeyword(keyword: string): string {
  return keyword.replace(/[;&|`$(){}[\]<>!#]/g, '');
}
