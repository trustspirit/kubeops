import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toRbacRule } from './rbac-rules';

describe('toRbacRule', () => {
  it('keeps resourceNames so a scoped rule is not shown as cluster-wide', () => {
    const rule = toRbacRule({ apiGroups: [''], resources: ['secrets'], verbs: ['get'], resourceNames: ['db-creds'] });
    assert.deepEqual(rule.resourceNames, ['db-creds']);
  });

  it('keeps nonResourceURLs and does not invent a core API group for them', () => {
    const rule = toRbacRule({ nonResourceURLs: ['/healthz', '/metrics'], verbs: ['get'] });
    assert.deepEqual(rule.nonResourceURLs, ['/healthz', '/metrics']);
    assert.deepEqual(rule.apiGroups, []);
    assert.deepEqual(rule.resources, []);
  });

  it('defaults a resource rule with no apiGroups to the core group and omits empty extras', () => {
    const rule = toRbacRule({ resources: ['pods'], verbs: ['list'] });
    assert.deepEqual(rule, { apiGroups: [''], resources: ['pods'], verbs: ['list'] });
  });
});
