import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { beforeEach, describe, it } from 'node:test';
import { getForwards, killAllForwards, type PortForwardInfo } from './port-forward-registry';

interface FakeProcess {
  killed: number;
  kill(): void;
}

function fakeProcess(options: { throwOnKill?: boolean } = {}): FakeProcess {
  return {
    killed: 0,
    kill() {
      this.killed += 1;
      if (options.throwOnKill) throw new Error('ESRCH');
    },
  };
}

function info(id: string): PortForwardInfo {
  return {
    id,
    clusterId: 'prod',
    namespace: 'default',
    resourceType: 'service',
    resourceName: 'api',
    containerPort: 8080,
    localPort: 18080,
    status: 'active',
  };
}

function register(id: string, proc: FakeProcess) {
  getForwards().set(id, { info: info(id), proc: proc as unknown as ChildProcess });
}

describe('port forward registry', () => {
  beforeEach(() => {
    getForwards().clear();
  });

  it('shares one map across importers', () => {
    // The shutdown hook and the API route are separate module instances in the
    // packaged app; a plain module-level Map left children running on quit.
    register('a', fakeProcess());
    assert.equal(getForwards().size, 1);
    assert.ok(getForwards().has('a'));
  });

  it('kills every registered child and empties the map', () => {
    const first = fakeProcess();
    const second = fakeProcess();
    register('a', first);
    register('b', second);

    killAllForwards();

    assert.equal(first.killed, 1);
    assert.equal(second.killed, 1);
    assert.equal(getForwards().size, 0);
  });

  it('keeps going when a child is already gone', () => {
    const dead = fakeProcess({ throwOnKill: true });
    const alive = fakeProcess();
    register('dead', dead);
    register('alive', alive);

    killAllForwards();

    assert.equal(alive.killed, 1);
    assert.equal(getForwards().size, 0);
  });

  it('is safe to call twice', () => {
    register('a', fakeProcess());
    killAllForwards();
    killAllForwards();
    assert.equal(getForwards().size, 0);
  });

  it('is a no-op with nothing registered', () => {
    killAllForwards();
    assert.equal(getForwards().size, 0);
  });
});
