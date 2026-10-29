import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesLabelSelector, selectorToString, isEmptySelector } from './label-selector';

describe('matchesLabelSelector', () => {
  const labels = { app: 'web', tier: 'frontend' };

  it('treats an absent or empty selector as match-all', () => {
    assert.equal(matchesLabelSelector(undefined, labels), true);
    assert.equal(matchesLabelSelector({}, labels), true);
    assert.equal(matchesLabelSelector({ matchLabels: {}, matchExpressions: [] }, undefined), true);
  });

  it('requires every matchLabels entry', () => {
    assert.equal(matchesLabelSelector({ matchLabels: { app: 'web' } }, labels), true);
    assert.equal(matchesLabelSelector({ matchLabels: { app: 'web', tier: 'backend' } }, labels), false);
    assert.equal(matchesLabelSelector({ matchLabels: { app: 'web' } }, undefined), false);
  });

  it('evaluates In', () => {
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'tier', operator: 'In', values: ['frontend', 'edge'] }] }, labels), true);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'tier', operator: 'In', values: ['backend'] }] }, labels), false);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'zone', operator: 'In', values: ['a'] }] }, labels), false);
  });

  it('evaluates NotIn, matching when the key is absent', () => {
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['backend'] }] }, labels), true);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['frontend'] }] }, labels), false);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'zone', operator: 'NotIn', values: ['a'] }] }, labels), true);
  });

  it('evaluates Exists and DoesNotExist', () => {
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'app', operator: 'Exists' }] }, labels), true);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'zone', operator: 'Exists' }] }, labels), false);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'zone', operator: 'DoesNotExist' }] }, labels), true);
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'app', operator: 'DoesNotExist' }] }, labels), false);
  });

  it('ANDs matchLabels with matchExpressions', () => {
    const sel = { matchLabels: { app: 'web' }, matchExpressions: [{ key: 'tier', operator: 'In', values: ['backend'] }] };
    assert.equal(matchesLabelSelector(sel, labels), false);
  });

  it('never matches on an unknown operator', () => {
    assert.equal(matchesLabelSelector({ matchExpressions: [{ key: 'app', operator: 'Gt', values: ['1'] }] }, labels), false);
  });
});

describe('selectorToString', () => {
  it('is stable regardless of key and value order', () => {
    const a = selectorToString({
      matchLabels: { b: '2', a: '1' },
      matchExpressions: [{ key: 'z', operator: 'In', values: ['y', 'x'] }, { key: 'legacy', operator: 'DoesNotExist' }],
    });
    const b = selectorToString({
      matchLabels: { a: '1', b: '2' },
      matchExpressions: [{ key: 'legacy', operator: 'DoesNotExist' }, { key: 'z', operator: 'In', values: ['x', 'y'] }],
    });
    assert.equal(a, b);
    assert.equal(a, 'a=1,b=2,!legacy,z in (x,y)');
  });

  it('distinguishes selectors that differ only in expressions', () => {
    assert.notEqual(
      selectorToString({ matchExpressions: [{ key: 'tier', operator: 'In', values: ['a'] }] }),
      selectorToString({ matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['a'] }] }),
    );
  });

  it('returns an empty string for an empty selector', () => {
    assert.equal(selectorToString({}), '');
    assert.equal(isEmptySelector({ matchLabels: {} }), true);
  });
});
