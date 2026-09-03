import { execFileSync } from 'child_process';
import { isCliAvailable, resolveCli } from '../cli-path';

/**
 * Find a CLI tool in PATH. Returns absolute path or null.
 * Uses `where` on Windows and `which` elsewhere.
 */
export function findCli(name: string): string | null {
  if (!isCliAvailable(name)) return null;
  const resolved = resolveCli(name, '');
  return resolved || null;
}

/**
 * Get CLI version string.
 */
export function getCliVersion(cliPath: string, versionArgs: string[] = ['--version']): string | undefined {
  try {
    return execFileSync(cliPath, versionArgs, { encoding: 'utf-8', timeout: 5_000 }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Run a CLI command safely using execFileSync (no shell injection).
 */
export function runCli(command: string, args: string[], timeoutMs = 30_000): string {
  return execFileSync(command, args, { encoding: 'utf-8', timeout: timeoutMs });
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
  const e = err as { stderr?: Buffer | string; message?: string };
  const raw = (typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString()) || e.message || fallback;
  return stripAnsi(raw);
}
