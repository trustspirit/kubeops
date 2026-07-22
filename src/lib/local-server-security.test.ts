import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isAllowedLocalHost, isAllowedWebSocketUpgrade } from './local-server-security';

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
