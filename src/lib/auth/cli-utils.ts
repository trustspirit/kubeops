import { execFile } from 'child_process';
import path from 'path';
import { findCliOnPath } from '../cli-path';
import { isSafeCliScalar } from '../exec-validation';

// `which` results barely change during a session, but status polls ask for
// them on every request. Cache briefly so a poll does not fork a lookup for
// every provider each time.
const CLI_LOOKUP_TTL_MS = 30_000;
const cliLookupCache = new Map<string, { value: string | null; at: number }>();
const cliLookupInFlight = new Map<string, Promise<string | null>>();

/**
 * Find a CLI tool in PATH. Resolves to an absolute path or null.
 * Uses `where` on Windows and `which` elsewhere.
 */
export async function findCli(name: string): Promise<string | null> {
  const cached = cliLookupCache.get(name);
  if (cached && Date.now() - cached.at < CLI_LOOKUP_TTL_MS) return cached.value;

  const inFlight = cliLookupInFlight.get(name);
  if (inFlight) return inFlight;

  const lookup = findCliOnPath(name)
    .then((value) => {
      cliLookupCache.set(name, { value, at: Date.now() });
      return value;
    })
    .finally(() => cliLookupInFlight.delete(name));
  cliLookupInFlight.set(name, lookup);
  return lookup;
}

/** Forget cached PATH lookups (e.g. after the user installs a CLI). */
export function clearCliLookupCache(): void {
  cliLookupCache.clear();
}

/**
 * Get CLI version string.
 */
export async function getCliVersion(cliPath: string, versionArgs: string[] = ['--version']): Promise<string | undefined> {
  try {
    return (await runCli(cliPath, versionArgs, 5_000)).trim();
  } catch {
    return undefined;
  }
}

// Large enough for `argocd app get -o json` on apps with big resource trees.
// execFileSync's 1 MB default silently truncated those into a parse error.
const CLI_MAX_BUFFER = 32 * 1024 * 1024;

/** Human-readable duration for timeout messages: "2 minutes", "30 seconds". */
export function formatTimeout(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/**
 * Raised when a CLI is killed for exceeding its timeout. Carries a readable
 * message in place of node's raw `spawn ... ETIMEDOUT` / `Command failed`.
 */
export class CliTimeoutError extends Error {
  readonly timedOut = true;
  constructor(message: string) {
    super(message);
    this.name = 'CliTimeoutError';
  }
}

export interface RunCliOptions {
  /** Subject of the timeout message, e.g. "Login" → "Login timed out after 2 minutes". */
  label?: string;
}

/**
 * Run a CLI command safely with execFile (argv array, no shell injection).
 *
 * Asynchronous on purpose: SSO logins wait on the user in a browser for up to
 * two minutes, and `argocd app sync` can take five. execFileSync froze the
 * entire server (every API route, watch and log stream) for that long.
 *
 * stdin is closed immediately, matching execFileSync's behaviour, so a CLI
 * that unexpectedly prompts fails fast instead of waiting out the timeout.
 */
export function runCli(
  command: string,
  args: string[],
  timeoutMs = 30_000,
  options: RunCliOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: CLI_MAX_BUFFER, windowsHide: true },
      (err, stdout, stderr) => {
        if (!err) {
          resolve(String(stdout));
          return;
        }
        const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };
        // execFile reports a timeout as a kill with the configured signal.
        if (e.killed && e.signal) {
          const label = options.label || path.basename(command);
          reject(new CliTimeoutError(`${label} timed out after ${formatTimeout(timeoutMs)}`));
          return;
        }
        // Mirror execFileSync's error shape so extractCliError keeps working.
        Object.assign(err, { stdout, stderr });
        reject(err);
      },
    );
    child.stdin?.end();
  });
}

/**
 * Defense in depth for user-supplied values that become their own argv entry
 * (positional args, or the value after `--flag`). execFile already rules out
 * shell injection, but a value such as `--exec=...` would still be parsed by
 * the CLI as an option. Returns the first offending field name, or null.
 * Empty / undefined fields are skipped — callers decide what is required.
 */
export function findUnsafeCliValue(fields: Record<string, string | undefined>): string | null {
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue;
    if (!isSafeCliScalar(value)) return name;
  }
  return null;
}

/**
 * Strip ANSI escape codes from CLI output.
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]|\x1B\].*?\x07/g, '');
}

/**
 * Extract error message from CLI execution failure.
 */
export function extractCliError(err: unknown, fallback: string): string {
  if (err instanceof CliTimeoutError) return err.message;
  const e = err as { stderr?: Buffer | string; message?: string };
  const raw = (typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString()) || e.message || fallback;
  return stripAnsi(raw);
}
