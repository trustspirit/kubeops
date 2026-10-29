import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import {
  isFatalPortForwardStderr,
  monitorPortForward,
  waitForPortForwardReady,
  waitForProcessExit,
} from './port-forward-process';

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

  it('does not treat a non-fatal startup warning as failure', async () => {
    const proc = createFakeProcess();
    const ready = wait(proc, 200);
    proc.stderr.write('Unable to listen on port 8080: Listeners failed to create: tcp6 [::1]:8080: bind: cannot assign requested address\n');
    proc.stdout.write('Forwarding from 127.0.0.1:8080 -> 8080\n');
    await ready;
  });

  it('reports the startup stderr as the reason when kubectl exits', async () => {
    const proc = createFakeProcess();
    const result = wait(proc, 200);
    proc.stderr.write('Unable to connect to the server: dial tcp: i/o timeout\n');
    await new Promise((resolve) => setImmediate(resolve));
    proc.emit('exit', 1, null);
    await assert.rejects(result, /i\/o timeout/);
  });
});

describe('isFatalPortForwardStderr', () => {
  it('matches kubectl fatal "error:" lines only', () => {
    assert.equal(isFatalPortForwardStderr('error: unable to forward port because pod is not running'), true);
    assert.equal(isFatalPortForwardStderr('warning\nerror: lost connection to pod'), true);
    assert.equal(isFatalPortForwardStderr('Unable to listen on port 8080: tcp6 bind failed'), false);
    assert.equal(isFatalPortForwardStderr('E1029 portforward.go:413] an error occurred forwarding'), false);
  });
});

describe('monitorPortForward', () => {
  it('reports the last stderr line when kubectl exits after readiness', async () => {
    const proc = createFakeProcess();
    let reason: string | undefined;
    monitorPortForward(proc as unknown as ChildProcess, (r) => { reason = r; });
    proc.stderr.write('E1029 an error occurred forwarding 8080 -> 80\n');
    proc.stderr.write('error: lost connection to pod\n');
    await new Promise((resolve) => setImmediate(resolve));
    proc.emit('exit', 1, null);
    assert.equal(reason, 'error: lost connection to pod');
  });

  it('reports a process error once and survives late error events', () => {
    const proc = createFakeProcess();
    const reasons: string[] = [];
    monitorPortForward(proc as unknown as ChildProcess, (r) => reasons.push(r));
    proc.emit('error', new Error('EPIPE'));
    proc.emit('exit', 2, null);
    proc.emit('exit', 2, null);
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /EPIPE/);
    // Must not throw: a listener is still attached.
    proc.emit('error', new Error('late'));
  });

  it('stays silent after an intentional detach', () => {
    const proc = createFakeProcess();
    let called = false;
    const detach = monitorPortForward(proc as unknown as ChildProcess, () => { called = true; });
    detach();
    proc.emit('exit', null, 'SIGTERM');
    assert.equal(called, false);
    proc.emit('error', new Error('late'));
  });
});

describe('waitForProcessExit', () => {
  it('resolves true on exit and false on timeout', async () => {
    const exiting = Object.assign(createFakeProcess(), { exitCode: null, signalCode: null });
    const result = waitForProcessExit(exiting as unknown as ChildProcess, 200);
    exiting.emit('exit', 0, null);
    assert.equal(await result, true);

    const stuck = Object.assign(createFakeProcess(), { exitCode: null, signalCode: null });
    assert.equal(await waitForProcessExit(stuck as unknown as ChildProcess, 10), false);
    assert.equal(stuck.listenerCount('exit'), 0);

    const already = Object.assign(createFakeProcess(), { exitCode: 0, signalCode: null });
    assert.equal(await waitForProcessExit(already as unknown as ChildProcess, 10), true);
  });
});
