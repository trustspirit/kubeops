import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildScalePatch, MAX_REPLICAS, parseReplicaInput } from './replica-input';

describe('parseReplicaInput', () => {
  it('treats an empty field as no value rather than zero', () => {
    assert.deepEqual(parseReplicaInput(''), { ok: false, error: null });
    assert.deepEqual(parseReplicaInput('   '), { ok: false, error: null });
  });

  it('accepts an explicit zero', () => {
    assert.deepEqual(parseReplicaInput('0'), { ok: true, replicas: 0 });
  });

  it('accepts whole numbers', () => {
    assert.deepEqual(parseReplicaInput(' 3 '), { ok: true, replicas: 3 });
  });

  it('rejects negatives, decimals and junk', () => {
    for (const raw of ['-1', '1.5', '1e3', 'abc', '2x']) {
      const result = parseReplicaInput(raw);
      assert.equal(result.ok, false, raw);
      assert.ok(!result.ok && result.error, raw);
    }
  });

  it('rejects values over the cap', () => {
    assert.equal(parseReplicaInput(String(MAX_REPLICAS + 1)).ok, false);
    assert.equal(parseReplicaInput(String(MAX_REPLICAS)).ok, true);
  });
});

describe('buildScalePatch', () => {
  it('touches only spec.replicas', () => {
    assert.deepEqual(buildScalePatch(4), { spec: { replicas: 4 } });
  });
});
