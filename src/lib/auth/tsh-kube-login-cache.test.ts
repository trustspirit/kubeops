import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  clearTshKubeLoginCache,
  ensureTshKubeLogin,
} from './tsh-kube-login-cache';

const originalFetch = globalThis.fetch;

afterEach(() => {
  clearTshKubeLoginCache();
  globalThis.fetch = originalFetch;
});

test('shares one tsh kube login across concurrent callers', async () => {
  let loginCalls = 0;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/auth/detect/')) {
      return Response.json({ providerId: 'tsh', kubeCluster: 'production' });
    }
    if (url === '/api/auth/tsh/login') {
      loginCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return Response.json({ success: true });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await Promise.all([
    ensureTshKubeLogin('production-context'),
    ensureTshKubeLogin('production-context'),
    ensureTshKubeLogin('production-context'),
  ]);

  assert.equal(loginCalls, 1);
});

test('shares a recent login between contexts targeting the same Teleport cluster', async () => {
  let loginCalls = 0;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/auth/detect/')) {
      return Response.json({ providerId: 'tsh', kubeCluster: 'shared-cluster' });
    }
    if (url === '/api/auth/tsh/login') {
      loginCalls += 1;
      return Response.json({ success: true });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await ensureTshKubeLogin('shared-context-a');
  await ensureTshKubeLogin('shared-context-b');

  assert.equal(loginCalls, 1);
});
