import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OVERVIEW_LIVE_SWR_OPTIONS,
  OVERVIEW_SLOW_SWR_OPTIONS,
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
