import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAge } from './format-age';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe('formatAge', () => {
  it('is precise for young resources', () => {
    assert.equal(formatAge(ago(42 * S), NOW), '42s');
    assert.equal(formatAge(ago(3 * M + 5 * S), NOW), '3m5s');
    assert.equal(formatAge(ago(5 * H + 20 * M), NOW), '5h20m');
    assert.equal(formatAge(ago(1 * D + 3 * H), NOW), '1d3h');
  });

  it('drops the smaller unit once it stops being useful', () => {
    assert.equal(formatAge(ago(2 * H), NOW), '2h');
    assert.equal(formatAge(ago(148 * D + 16 * H), NOW), '148d');
    assert.equal(formatAge(ago(516 * D + 22 * H), NOW), '1y151d');
    assert.equal(formatAge(ago(730 * D), NOW), '2y');
  });

  it('tolerates clock skew and bad input', () => {
    assert.equal(formatAge(ago(-5 * S), NOW), '0s');
    assert.equal(formatAge('not a date', NOW), '-');
  });
});
