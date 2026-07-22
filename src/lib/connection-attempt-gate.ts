export interface ConnectionAttempt {
  isCurrent(): boolean;
}

export class ConnectionAttemptGate {
  private generation = 0;
  private inFlight: Promise<void> | null = null;

  run(work: (attempt: ConnectionAttempt) => Promise<void>): Promise<void> {
    if (this.inFlight) return this.inFlight;

    const generation = ++this.generation;
    const attempt: ConnectionAttempt = {
      isCurrent: () => this.generation === generation,
    };

    const promise = work(attempt).finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    return promise;
  }

  invalidate(): void {
    this.generation += 1;
    this.inFlight = null;
  }
}
