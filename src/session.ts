/**
 * Serializes study loads and stamps an epoch so in-flight agent work cannot
 * paint measurements from study A onto study B.
 */
export class StudyGate {
  epoch = 0;
  loading = false;

  /** Bump epoch, mark loading, return the generation for this attempt. */
  beginLoad(): number {
    this.epoch += 1;
    this.loading = true;
    return this.epoch;
  }

  /** True only for the latest load — apply UI/snapshot only then. */
  commit(gen: number): boolean {
    if (gen !== this.epoch) return false;
    this.loading = false;
    return true;
  }

  /** Clear loading if this gen is still current (error / cancel). */
  fail(gen: number): void {
    if (gen === this.epoch) this.loading = false;
  }

  isCurrent(gen: number): boolean {
    return gen === this.epoch;
  }
}

/**
 * One-at-a-time queue for mutating agent tools so concurrent agents
 * don't interleave find/focus/view/export on the shared viewer.
 */
export function createExclusiveQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = tail.then(() => fn());
    // Keep the chain alive after rejection so later callers still run.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
