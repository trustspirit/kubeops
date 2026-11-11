import type { ChildProcess } from 'node:child_process';

const MAX_STARTUP_REASON_LENGTH = 240;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]+/g;

function sanitizeStartupReason(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const reason = value
    .replace(CONTROL_CHARACTER, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STARTUP_REASON_LENGTH);
  return reason || fallback;
}

export function waitForPortForwardReady(proc: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const onStdout = (chunk: Buffer | string) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-4096);
      if (stdout.includes('Forwarding from')) settle();
    };
    // stderr alone is not fatal: kubectl and exec credential plugins print
    // warnings there and still go on to forward. A real failure makes kubectl
    // exit, so keep the text and report it as the reason when that happens.
    const onStderr = (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4096);
    };
    const onError = () => settle(new Error('Unable to start port forward'));
    const onExit = () => settle(new Error(
      sanitizeStartupReason(stderr, 'Port forward exited before readiness'),
    ));

    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout?.off('data', onStdout);
      proc.stderr?.off('data', onStderr);
      proc.off('error', onError);
      proc.off('exit', onExit);
    };

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    proc.stdout?.on('data', onStdout);
    proc.stderr?.on('data', onStderr);
    proc.on('error', onError);
    proc.on('exit', onExit);

    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* process already stopped */ }
      const reason = sanitizeStartupReason(stderr, '');
      settle(new Error(reason ? `Port forward startup timed out: ${reason}` : 'Port forward startup timed out'));
    }, timeoutMs);
  });
}
