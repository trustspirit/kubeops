export interface PodRestartSnapshot {
  uid?: string;
  restartCount: number;
}

export type StoredPodRestartSnapshot = PodRestartSnapshot | number;

interface PodRestartEvaluation {
  next: PodRestartSnapshot;
  delta: number;
  changed: boolean;
}

export function evaluatePodRestart(
  previous: StoredPodRestartSnapshot | undefined,
  uid: string | undefined,
  restartCount: number,
): PodRestartEvaluation {
  const next = { uid, restartCount };

  if (previous === undefined || typeof previous === 'number') {
    return { next, delta: 0, changed: true };
  }

  const uidChanged = Boolean(previous.uid && uid && previous.uid !== uid);
  const countRolledBack = restartCount < previous.restartCount;
  if (uidChanged || countRolledBack) {
    return { next, delta: 0, changed: true };
  }

  const delta = restartCount - previous.restartCount;
  const changed = previous.uid !== uid || delta !== 0;
  return { next, delta: Math.max(delta, 0), changed };
}
