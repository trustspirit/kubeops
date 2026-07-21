import assert from 'node:assert/strict';
import test from 'node:test';
import { isSidebarRouteActive } from './sidebar-route';

test('matches a resource type as a complete path segment', () => {
  assert.equal(isSidebarRouteActive('/clusters/a/namespaces/default/pods', 'pods'), true);
  assert.equal(isSidebarRouteActive('/clusters/a/namespaces/default/podsecuritypolicies', 'pods'), false);
});

test('matches the cluster overview only at the cluster root', () => {
  assert.equal(isSidebarRouteActive('/clusters/a', '', 'a'), true);
  assert.equal(isSidebarRouteActive('/clusters/a/namespaces/default/pods', '', 'a'), false);
});
