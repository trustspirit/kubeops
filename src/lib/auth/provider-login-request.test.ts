import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { clearProviderLoginRequests, requestProviderLogin } from './provider-login-request';

const originalFetch = globalThis.fetch;

afterEach(() => {
  clearProviderLoginRequests();
  globalThis.fetch = originalFetch;
});

test('deduplicates concurrent provider login requests with equivalent config', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({ success: true, authenticated: true });
  };

  const [first, second] = await Promise.all([
    requestProviderLogin('tsh', { proxyUrl: 'proxy', action: 'proxy-login' }),
    requestProviderLogin('tsh', { action: 'proxy-login', proxyUrl: 'proxy' }),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test('allows a new login after the previous request settles', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ success: true });
  };

  await requestProviderLogin('tsh', { action: 'proxy-login' });
  await requestProviderLogin('tsh', { action: 'proxy-login' });

  assert.equal(calls, 2);
});
