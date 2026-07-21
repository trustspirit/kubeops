import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OVERVIEW_LIVE_SWR_OPTIONS,
  OVERVIEW_SLOW_SWR_OPTIONS,
  getResourceFreshness,
  isResourceListCacheKey,
} from './resource-freshness';

describe('Overview freshness policy', () => {
  it('refreshes live data every 15 seconds and on focus', () => {
    assert.deepEqual(OVERVIEW_LIVE_SWR_OPTIONS, {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
    });
  });

  it('refreshes low-volatility data every 30 seconds and on focus', () => {
    assert.deepEqual(OVERVIEW_SLOW_SWR_OPTIONS, {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
    });
  });
});

describe('isResourceListCacheKey', () => {
  it('matches specific and all-namespace list keys for the resource', () => {
    assert.equal(
      isResourceListCacheKey('/api/clusters/dev/resources/default/pods', 'dev', 'pods'),
      true,
    );
    assert.equal(
      isResourceListCacheKey('/api/clusters/dev/resources/_all/pods', 'dev', 'pods'),
      true,
    );
  });

  it('does not match detail, other resource, or other cluster keys', () => {
    assert.equal(
      isResourceListCacheKey('/api/clusters/dev/resources/default/pods/pod-a', 'dev', 'pods'),
      false,
    );
    assert.equal(
      isResourceListCacheKey('/api/clusters/dev/resources/default/services', 'dev', 'pods'),
      false,
    );
    assert.equal(
      isResourceListCacheKey('/api/clusters/prod/resources/default/pods', 'dev', 'pods'),
      false,
    );
  });
});

describe('getResourceFreshness', () => {
  const now = Date.parse('2026-07-21T12:00:00.000Z');

  it('distinguishes data that has not loaded yet', () => {
    assert.deepEqual(getResourceFreshness(null, now), {
      label: 'Not updated yet',
      isStale: false,
    });
  });

  it('shows a concise relative age for recent data', () => {
    assert.deepEqual(getResourceFreshness(now - 45_000, now), {
      label: 'Updated 45s ago',
      isStale: false,
    });
    assert.deepEqual(getResourceFreshness(now - 90_000, now), {
      label: 'Updated 1m ago',
      isStale: false,
    });
  });

  it('marks data stale after the configured freshness window', () => {
    assert.deepEqual(getResourceFreshness(now - 3 * 60_000, now, 2 * 60_000), {
      label: 'Updated 3m ago',
      isStale: true,
    });
  });
});
