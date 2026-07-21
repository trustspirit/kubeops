import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import * as providerLoginRequest from './provider-login-request';

const { clearProviderLoginRequests, requestProviderLogin } = providerLoginRequest;

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

test('publishes provider login progress until the request settles', async () => {
  let finishRequest: ((response: Response) => void) | undefined;
  globalThis.fetch = () => new Promise<Response>((resolve) => {
    finishRequest = resolve;
  });

  const getOperations = (providerLoginRequest as unknown as {
    getProviderLoginOperations: () => Array<{
      providerId: string;
      scope: string;
      clusterId?: string;
      startedAt: number;
    }>;
  }).getProviderLoginOperations;

  assert.equal(typeof getOperations, 'function');

  const login = requestProviderLogin('tsh', { action: 'proxy-login' });
  assert.deepEqual(getOperations(), [{
    providerId: 'tsh',
    scope: 'provider',
    startedAt: getOperations()[0]?.startedAt,
  }]);

  finishRequest?.(Response.json({ success: true }));
  await login;

  assert.deepEqual(getOperations(), []);
});

test('publishes cluster-scoped progress for kube login and clears it on failure', async () => {
  let rejectRequest: ((error: Error) => void) | undefined;
  globalThis.fetch = () => new Promise<Response>((_resolve, reject) => {
    rejectRequest = reject;
  });

  const getOperations = (providerLoginRequest as unknown as {
    getProviderLoginOperations: () => Array<{
      providerId: string;
      scope: string;
      clusterId?: string;
      startedAt: number;
    }>;
  }).getProviderLoginOperations;

  assert.equal(typeof getOperations, 'function');

  const login = requestProviderLogin(
    'tsh',
    { action: 'kube-login', cluster: 'production' },
    { clusterId: 'production-context' },
  );

  assert.equal(getOperations()[0]?.scope, 'cluster');
  assert.equal(getOperations()[0]?.clusterId, 'production-context');

  rejectRequest?.(new Error('browser login cancelled'));
  await assert.rejects(login, /browser login cancelled/);
  assert.deepEqual(getOperations(), []);
});
