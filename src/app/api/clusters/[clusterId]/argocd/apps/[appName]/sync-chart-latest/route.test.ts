import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planChartSync } from './route';

const floatingOutOfSync = {
  spec: { source: { chart: 'web', repoURL: 'https://charts', targetRevision: '1.2.*' } },
  status: { sync: { revision: '1.3.0', status: 'OutOfSync' } },
};

describe('planChartSync', () => {
  it('flags a floating app that is OutOfSync as an available update', () => {
    const plan = planChartSync(floatingOutOfSync, { checkOnly: true });
    assert.equal(plan.pinned, false);
    assert.equal(plan.chart, 'web');
    assert.equal(plan.updateAvailable, true);
    assert.equal(plan.supported, true);
  });

  it('flags a synced floating app as up to date', () => {
    const plan = planChartSync(
      { spec: { source: { chart: 'web', targetRevision: '1.2.*' } }, status: { sync: { revision: '1.2.9', status: 'Synced' } } },
      { checkOnly: true },
    );
    assert.equal(plan.updateAvailable, false);
  });

  it('marks a pinned app unsupported in the floating-only route', () => {
    const plan = planChartSync(
      { spec: { source: { chart: 'web', targetRevision: '1.2.3' } }, status: { sync: { revision: '1.2.3', status: 'Synced' } } },
      { checkOnly: true },
    );
    assert.equal(plan.pinned, true);
    assert.equal(plan.supported, false);
    assert.ok(plan.reason);
  });

  it('returns supported:false with a reason for a non-helm app', () => {
    const plan = planChartSync({ spec: { source: { repoURL: 'https://git', path: 'x' } }, status: {} }, { checkOnly: true });
    assert.equal(plan.supported, false);
  });
});
