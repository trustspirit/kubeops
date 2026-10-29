import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInstallOnce, useUpdateStore } from './update-store';

describe('update store', () => {
  it('keeps the update phase outside any component instance', () => {
    const { dispatch } = useUpdateStore.getState();
    dispatch({ type: 'download-requested' });
    dispatch({ type: 'status-received', status: { status: 'downloaded', version: '1.2.3' } as never });
    // A remounted header reads the same store.
    assert.equal(useUpdateStore.getState().phase, 'downloaded');
    dispatch({ type: 'dismissed' });
    assert.equal(useUpdateStore.getState().phase, 'idle');
  });

  it('runs at most one install at a time', async () => {
    let resolve!: () => void;
    const first = runInstallOnce(() => new Promise<void>((r) => { resolve = r; }));
    assert.ok(first);
    assert.equal(runInstallOnce(() => Promise.resolve()), null);
    resolve();
    await first;
    const again = runInstallOnce(() => Promise.resolve());
    assert.ok(again);
    await again;
  });
});
