import { execFile, execFileSync } from 'child_process';
import path, { delimiter } from 'path';

/**
 * GUI-launched apps on macOS inherit a bare PATH that misses the directories
 * every package manager installs into. Linux desktop launchers have the same
 * problem to a lesser degree.
 */
const EXTRA_POSIX_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

export function isWindows(platform: string = process.platform): boolean {
  return platform === 'win32';
}

export type MutableEnv = Record<string, string | undefined>;

/** Add the well-known tool directories to PATH if they are not already there. */
export function ensureToolPath(
  env: MutableEnv = process.env,
  platform: string = process.platform,
): void {
  if (isWindows(platform)) return;
  const current = env.PATH || '';
  const parts = current.split(delimiter);
  const missing = EXTRA_POSIX_PATHS.filter((p) => !parts.includes(p));
  if (missing.length) {
    env.PATH = [...parts, ...missing].filter(Boolean).join(delimiter);
  }
}

/**
 * Choose the best candidate from a lookup tool's output.
 *
 * Paths containing spaces are avoided because several call sites still hand the
 * result to a shell, and `.rd/bin` (Rancher Desktop's shim) is skipped because
 * it wraps kubectl in a way that breaks interactive exec.
 *
 * `platform` selects which absolute-path grammar applies, so `where` output
 * like `C:\tools\kubectl.exe` is recognised.
 */
export function pickCliPath(
  candidates: string[],
  fallback: string,
  platform: string = process.platform,
): string {
  const isAbsolute = isWindows(platform) ? path.win32.isAbsolute : path.posix.isAbsolute;
  const cleaned = candidates
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isAbsolute(line));

  return cleaned.find((p) => !p.includes(' ') && !p.includes('.rd/bin'))
    ?? cleaned.find((p) => !p.includes(' '))
    ?? cleaned[0]
    ?? fallback;
}

/**
 * Locate a CLI on PATH, cross-platform.
 *
 * `which` does not exist on Windows, so a hardcoded `which -a` (and a
 * `/usr/local/bin/...` fallback) left tools such as helm entirely unusable
 * there. Falls back to the bare command name so the OS can still resolve it
 * through PATH at spawn time.
 */
export function resolveCli(name: string, fallback: string = name): string {
  ensureToolPath();
  const lookup = isWindows() ? 'where' : 'which';
  const args = isWindows() ? [name] : ['-a', name];
  try {
    const output = execFileSync(lookup, args, { encoding: 'utf-8', timeout: 5_000 });
    return pickCliPath(output.split(/\r?\n/), fallback, process.platform);
  } catch {
    return fallback;
  }
}

/** Whether a CLI is present on PATH. */
export function isCliAvailable(name: string): boolean {
  ensureToolPath();
  const lookup = isWindows() ? 'where' : 'which';
  try {
    execFileSync(lookup, [name], { encoding: 'utf-8', timeout: 5_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Non-blocking `which`/`where` lookup.
 *
 * The sync variants above are fine at module load, but auth status polls run
 * them on every request; a slow PATH (network home directory, antivirus on
 * Windows) would stall the whole server event loop for each one.
 *
 * Resolves to `null` when the tool is not on PATH.
 */
export function findCliOnPath(name: string): Promise<string | null> {
  ensureToolPath();
  const lookup = isWindows() ? 'where' : 'which';
  const args = isWindows() ? [name] : ['-a', name];
  return new Promise((resolve) => {
    const child = execFile(lookup, args, { encoding: 'utf-8', timeout: 5_000, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(pickCliPath(String(stdout).split(/\r?\n/), '', process.platform) || null);
    });
    child.stdin?.end();
  });
}
