import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getInstallStageCopy,
  initialUpdateState,
  reduceUpdateState,
  type UpdateState,
} from './update-state';

describe('reduceUpdateState', () => {
  it('uses an IPC update result only while the check is still pending', () => {
    const checking: UpdateState = { ...initialUpdateState, phase: 'checking' };
    assert.equal(
      reduceUpdateState(checking, { type: 'check-completed', version: '0.5.0' }).phase,
      'available',
    );

    const alreadyCurrent: UpdateState = { ...checking, phase: 'not-available' };
    assert.equal(
      reduceUpdateState(alreadyCurrent, { type: 'check-completed', version: '0.4.9' }).phase,
      'not-available',
    );
  });

  it('moves a downloaded update to installing immediately', () => {
    const downloaded: UpdateState = {
      ...initialUpdateState,
      phase: 'downloaded',
      version: '0.5.0',
    };

    assert.deepEqual(reduceUpdateState(downloaded, { type: 'install-requested' }), {
      ...downloaded,
      phase: 'installing',
      installStage: 'preparing',
      errorMessage: null,
    });
  });

  it('updates the visible installation stage from updater events', () => {
    const installing: UpdateState = {
      ...initialUpdateState,
      phase: 'installing',
      installStage: 'preparing',
    };

    assert.deepEqual(
      reduceUpdateState(installing, {
        type: 'status-received',
        status: { status: 'installing', stage: 'restarting' },
      }),
      {
        ...installing,
        installStage: 'restarting',
      },
    );
  });

  it('surfaces an installation failure instead of swallowing it', () => {
    const installing: UpdateState = {
      ...initialUpdateState,
      phase: 'installing',
      installStage: 'extracting',
    };

    assert.deepEqual(
      reduceUpdateState(installing, {
        type: 'operation-failed',
        message: 'Install failed: permission denied',
      }),
      {
        ...installing,
        phase: 'error',
        installStage: null,
        errorMessage: 'Install failed: permission denied',
      },
    );
  });
});

describe('getInstallStageCopy', () => {
  it('explains each potentially slow installation stage', () => {
    assert.equal(getInstallStageCopy('preparing'), 'Preparing update…');
    assert.equal(getInstallStageCopy('extracting'), 'Installing update…');
    assert.equal(getInstallStageCopy('restarting'), 'Restarting app…');
  });
});
