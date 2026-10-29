import type { ChildProcess } from 'node:child_process';

const MAX_STARTUP_REASON_LENGTH = 240;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]+/g;
// kubectl reports fatal command errors as a line starting with "error:" and
// then exits. Other stderr output during startup is not fatal — notably the
// "Unable to listen on port ... tcp6 [::1]: bind: cannot assign requested
// address" warning on hosts without IPv6, after which IPv4 forwarding works.
const FATAL_STDERR = /^error:/im;

function sanitizeStartupReason(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const reason = value
    .replace(CONTROL_CHARACTER, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STARTUP_REASON_LENGTH);
  return reason || fallback;
}

/** Whether stderr output from `kubectl port-forward` means it is giving up. */
export function isFatalPortForwardStderr(text: string): boolean {
  return FATAL_STDERR.test(text);
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
    const onStderr = (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4096);
      if (isFatalPortForwardStderr(stderr)) {
        settle(new Error(sanitizeStartupReason(stderr, 'Port forward failed to start')));
      }
    };
    const onError = () => settle(new Error('Unable to start port forward'));
    // If kubectl exits, whatever it printed to stderr is the best reason.
    const onExit = () => settle(new Error(sanitizeStartupReason(stderr, 'Port forward exited before readiness')));

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
      settle(new Error('Port forward startup timed out'));
    }, timeoutMs);
  });
}

/**
 * Keep watching a forward after it became ready.
 *
 * Without an 'error' listener a late spawn/pipe error on the child is an
 * uncaught 'error' event; and when kubectl exits (pod restarted, credentials
 * expired) the forward used to vanish from the list with no reason. Calls
 * `onExit` once with the most useful reason available. Also keeps both pipes
 * drained so kubectl never blocks on a full stderr buffer.
 *
 * Returns a function that detaches the listeners (call it before an
 * intentional stop so that is not reported as a failure).
 */
export function monitorPortForward(proc: ChildProcess, onExit: (reason: string) => void): () => void {
  let stderr = '';
  let done = false;

  const onStdout = () => { /* drain */ };
  const onStderr = (chunk: Buffer | string) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-4096);
  };
  const onError = (err: Error) => {
    stderr = `${stderr}\n${err.message}`.slice(-4096);
  };
  const onProcessExit = (code: number | null, signal: NodeJS.Signals | null) => {
    if (done) return;
    done = true;
    detach();
    // Report the last stderr line: earlier lines are usually per-connection
    // noise, the last one is what made kubectl give up.
    const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const fallback = signal ? `kubectl port-forward stopped (${signal})` : `kubectl port-forward exited with code ${code}`;
    onExit(sanitizeStartupReason(lines[lines.length - 1], fallback));
  };

  const detach = () => {
    proc.stdout?.off('data', onStdout);
    proc.stderr?.off('data', onStderr);
    proc.off('exit', onProcessExit);
    // Keep a no-op error listener: an 'error' with no listener would throw.
    proc.off('error', onError);
    proc.on('error', () => { /* stopped intentionally */ });
  };

  proc.stdout?.on('data', onStdout);
  proc.stderr?.on('data', onStderr);
  proc.on('error', onError);
  proc.on('exit', onProcessExit);

  return () => {
    if (done) return;
    done = true;
    detach();
  };
}

/**
 * Resolve once the child has exited, or after `timeoutMs`. Resolves `true`
 * if it exited in time. Used on DELETE so a restart can bind the same local
 * port instead of racing the dying kubectl for it.
 */
export function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (typeof proc.exitCode === 'number' || typeof proc.signalCode === 'string') return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      proc.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    proc.once('exit', onExit);
  });
}
