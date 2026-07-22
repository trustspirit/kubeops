import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { waitForPortForwardReady } from './port-forward-process';

interface FakeProcess extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  kill: () => boolean;
}

function createFakeProcess(): FakeProcess {
  const proc = new EventEmitter() as FakeProcess;
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.killed = false;
  proc.kill = () => {
    proc.killed = true;
    return true;
  };
  return proc;
}

function wait(proc: FakeProcess, timeoutMs: number): Promise<void> {
  return waitForPortForwardReady(proc as unknown as ChildProcess, timeoutMs);
}

describe('port-forward process readiness', () => {
  it('resolves only after kubectl reports Forwarding and removes temporary listeners', async () => {
    const proc = createFakeProcess();
    const ready = wait(proc, 100);
    proc.stdout.write('Forwarding from 127.0.0.1:18080 -> 8080\n');
    await ready;

    assert.equal(proc.killed, false);
    assert.equal(proc.stdout.listenerCount('data'), 0);
    assert.equal(proc.stderr.listenerCount('data'), 0);
    assert.equal(proc.listenerCount('error'), 0);
    assert.equal(proc.listenerCount('exit'), 0);
  });

  it('recognizes a readiness message split across stdout chunks', async () => {
    const proc = createFakeProcess();
    const ready = wait(proc, 100);
    proc.stdout.write('Forwarding fr');
    proc.stdout.write('om 127.0.0.1:18080 -> 8080\n');
    await ready;
  });

  it('rejects stderr startup failure and terminates on timeout', async () => {
    const failed = createFakeProcess();
    const failure = wait(failed, 100);
    failed.stderr.write('error: unable to listen on any requested ports\n');
    await assert.rejects(failure, /unable to listen/);

    const timedOut = createFakeProcess();
    await assert.rejects(wait(timedOut, 5), /timed out/i);
    assert.equal(timedOut.killed, true);
  });

  it('rejects process errors and exits before readiness', async () => {
    const errored = createFakeProcess();
    const errorResult = wait(errored, 100);
    errored.emit('error', new Error('spawn kubectl ENOENT'));
    await assert.rejects(errorResult, /Unable to start port forward/);

    const exited = createFakeProcess();
    const exitResult = wait(exited, 100);
    exited.emit('exit', 1, null);
    await assert.rejects(exitResult, /exited before readiness/);
  });
});
