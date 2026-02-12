import { execSync, spawn } from 'child_process';
import { isAbsolute } from 'path';

let helmPath = '/usr/local/bin/helm';
try {
  const paths = execSync('which -a helm', { encoding: 'utf-8' }).trim().split('\n');
  const validPaths = paths.filter(p =>
    isAbsolute(p) && !p.includes(' ') && !p.includes('..') && !p.includes('.rd/bin')
  );
  helmPath = validPaths[0] || '/usr/local/bin/helm';
} catch { /* use default */ }

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

export async function runHelm(
  args: string[],
  kubeContext?: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const fullArgs = kubeContext ? ['--kube-context', kubeContext, ...args] : args;
  return new Promise((resolve) => {
    const proc = spawn(helmPath, fullArgs, { env: process.env });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        proc.kill('SIGTERM');
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 5000);
        resolve({ stdout, stderr: 'Command timed out', code: 124 });
      }
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        resolve({ stdout, stderr, code: code ?? 1 });
      }
    });

    proc.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        resolve({ stdout, stderr: err.message, code: 1 });
      }
    });
  });
}

export function isHelmAvailable(): boolean {
  try {
    execSync(`${helmPath} version --short`, { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Validate a helm resource name (release name, repo name, etc.) */
export function isValidHelmName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/.test(name);
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
