import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isAllowedLocalHost, isAllowedWebSocketUpgrade, isSameOriginRequest } from './local-server-security';

describe('local server security', () => {
  it('accepts only loopback hosts on the configured port', () => {
    assert.equal(isAllowedLocalHost('localhost:51230', 51230), true);
    assert.equal(isAllowedLocalHost('127.0.0.1:51230', 51230), true);
    assert.equal(isAllowedLocalHost('[::1]:51230', 51230), true);
    assert.equal(isAllowedLocalHost('attacker.example:51230', 51230), false);
    assert.equal(isAllowedLocalHost('localhost:9999', 51230), false);
  });

  it('requires matching local Host, Origin, and nonce for application sockets', () => {
    const valid = {
      host: 'localhost:51230',
      origin: 'http://localhost:51230',
      nonce: 'client-nonce',
      expectedNonce: 'client-nonce',
      port: 51230,
    };
    assert.equal(isAllowedWebSocketUpgrade(valid), true);
    assert.equal(isAllowedWebSocketUpgrade({ ...valid, origin: 'https://attacker.example' }), false);
    assert.equal(isAllowedWebSocketUpgrade({ ...valid, nonce: 'wrong' }), false);
    assert.equal(isAllowedWebSocketUpgrade({ ...valid, nonce: undefined }), false);
  });

  it('safely rejects malformed application upgrade hosts and request URLs', () => {
    const valid = {
      host: 'localhost:51230',
      origin: 'http://localhost:51230',
      nonce: undefined,
      requestUrl: '/ws/logs/pod?nonce=client-nonce',
      expectedNonce: 'client-nonce',
      port: 51230,
    };

    assert.equal(isAllowedWebSocketUpgrade(valid), true);
    assert.doesNotThrow(() => {
      assert.equal(isAllowedWebSocketUpgrade({ ...valid, host: 'localhost:99999' }), false);
    });
    assert.doesNotThrow(() => {
      assert.equal(isAllowedWebSocketUpgrade({ ...valid, requestUrl: 'http://[::1' }), false);
    });
  });

  it('checks every upgrade Host before classifying application sockets', () => {
    const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
    const upgradeHandler = serverSource.slice(serverSource.indexOf("server.on('upgrade'"));
    const hostBoundary = upgradeHandler.indexOf('isAllowedLocalHost(request.headers.host, port)');
    const socketClassification = upgradeHandler.indexOf('const isApplicationSocket');

    assert.ok(hostBoundary >= 0, 'upgrade handler must reject a foreign Host');
    assert.ok(hostBoundary < socketClassification, 'Host boundary must run before socket classification');
  });
});

describe('isSameOriginRequest', () => {
  it('allows safe methods with no Origin (navigations, EventSource)', () => {
    assert.equal(isSameOriginRequest({ method: 'GET', host: 'localhost:51230', origin: null }), true);
    assert.equal(isSameOriginRequest({ method: 'HEAD', host: 'localhost:51230', origin: null }), true);
  });

  it('allows a state-changing request from the app window itself', () => {
    assert.equal(isSameOriginRequest({
      method: 'POST', host: 'localhost:51230', origin: 'http://localhost:51230',
    }), true);
  });

  it('rejects a cross-site form POST, which arrives without a CORS preflight', () => {
    assert.equal(isSameOriginRequest({
      method: 'POST', host: 'localhost:51230', origin: 'https://evil.example',
    }), false);
  });

  it('rejects a state-changing request with no Origin at all', () => {
    assert.equal(isSameOriginRequest({ method: 'DELETE', host: 'localhost:51230', origin: null }), false);
  });

  it('rejects a different port on the same host', () => {
    assert.equal(isSameOriginRequest({
      method: 'POST', host: 'localhost:51230', origin: 'http://localhost:3000',
    }), false);
  });

  it('rejects an https origin — the local server only ever speaks http', () => {
    assert.equal(isSameOriginRequest({
      method: 'PUT', host: 'localhost:51230', origin: 'https://localhost:51230',
    }), false);
  });

  it('rejects a malformed Origin header', () => {
    assert.equal(isSameOriginRequest({
      method: 'PATCH', host: 'localhost:51230', origin: 'not a url',
    }), false);
  });

  it('is case-insensitive about the method', () => {
    assert.equal(isSameOriginRequest({ method: 'get', host: 'localhost:51230', origin: null }), true);
  });
});
