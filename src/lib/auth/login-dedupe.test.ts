import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loginKey, runLoginOnce } from './login-dedupe';

describe('runLoginOnce', () => {
  it('shares one in-flight login for identical provider + config', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const login = async () => {
      calls += 1;
      await gate;
      return { success: true };
    };

    const first = runLoginOnce('tsh', { action: 'kube-login', cluster: 'a' }, login);
    const second = runLoginOnce('tsh', { cluster: 'a', action: 'kube-login' }, login);
    release();
    assert.deepEqual(await first, { success: true });
    assert.deepEqual(await second, { success: true });
    assert.equal(calls, 1);
  });

  it('runs separately for different clusters and again after settling', async () => {
    let calls = 0;
    const login = async () => { calls += 1; return { success: true }; };
    await Promise.all([
      runLoginOnce('tsh', { cluster: 'a' }, login),
      runLoginOnce('tsh', { cluster: 'b' }, login),
    ]);
    assert.equal(calls, 2);
    await runLoginOnce('tsh', { cluster: 'a' }, login);
    assert.equal(calls, 3);
  });

  it('clears the slot when the login rejects', async () => {
    await assert.rejects(runLoginOnce('aws-sso', {}, async () => { throw new Error('boom'); }), /boom/);
    const result = await runLoginOnce('aws-sso', {}, async () => ({ success: true }));
    assert.equal(result.success, true);
  });

  it('builds order-independent keys', () => {
    assert.equal(loginKey('x', { a: '1', b: '2' }), loginKey('x', { b: '2', a: '1' }));
    assert.notEqual(loginKey('x', { a: '1' }), loginKey('y', { a: '1' }));
  });
});
