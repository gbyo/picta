/**
 * The advance timer.
 *
 * Wrapped in a tiny injectable interface so the timing rules — in particular
 * "Previous/Next restarts the full interval" — can be unit-tested with a fake
 * clock instead of real waiting.
 *
 * There is no render loop anywhere in Picta: a still image costs one timer.
 */

export interface TimerHost {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const realTimerHost: TimerHost = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export class AdvanceTimer {
  #host: TimerHost;
  #handle: number | null = null;
  #intervalMs: number;
  #onFire: () => void;

  constructor(host: TimerHost, intervalMs: number, onFire: () => void) {
    this.#host = host;
    this.#intervalMs = intervalMs;
    this.#onFire = onFire;
  }

  get running(): boolean {
    return this.#handle !== null;
  }

  get intervalMs(): number {
    return this.#intervalMs;
  }

  /**
   * (Re)start the countdown from zero. Called after every image actually
   * appears, including after a manual Previous/Next, so a manual step always
   * grants the new image a fresh full interval.
   */
  restart(): void {
    this.cancel();
    this.#handle = this.#host.setTimeout(() => {
      this.#handle = null;
      this.#onFire();
    }, this.#intervalMs);
  }

  cancel(): void {
    if (this.#handle !== null) {
      this.#host.clearTimeout(this.#handle);
      this.#handle = null;
    }
  }

  /** Changing the interval while running restarts the countdown. */
  setInterval(intervalMs: number): void {
    this.#intervalMs = intervalMs;
    if (this.running) this.restart();
  }
}

/** Deterministic fake clock for tests. */
export function createFakeTimerHost(): TimerHost & {
  advance(ms: number): void;
  readonly pending: number;
  readonly now: number;
} {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; handler: () => void }>();

  return {
    setTimeout(handler, ms) {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: now + ms, handler });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let soonestHandle: number | null = null;
        let soonestAt = Number.POSITIVE_INFINITY;
        for (const [handle, timer] of timers) {
          if (timer.at <= target && timer.at < soonestAt) {
            soonestAt = timer.at;
            soonestHandle = handle;
          }
        }
        if (soonestHandle === null) break;
        const timer = timers.get(soonestHandle);
        timers.delete(soonestHandle);
        now = soonestAt;
        timer?.handler();
      }
      now = target;
    },
    get pending() {
      return timers.size;
    },
    get now() {
      return now;
    },
  };
}
