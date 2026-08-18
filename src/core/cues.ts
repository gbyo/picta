/** Testable cue sequencing.  Presentation never owns this state machine. */

import type { Cue } from './domain.js';

export interface CueRunner {
  /** Return true only after the cue actually rendered/played. */
  run(cue: Cue, index: number, total: number): Promise<boolean>;
  cancel?(): void;
}

export interface CueQueueState {
  active: boolean;
  index: number;
  total: number;
  current: Cue | null;
}

export interface CueQueueHandlers {
  onState?(state: CueQueueState): void;
  onSkipped?(cue: Cue, index: number, reason: 'failed' | 'cancelled'): void;
  onFinished?(): void;
}

/**
 * Small serial queue for player/media/group cues.
 *
 * A generation number makes late promises from a cancelled video harmless. A
 * failed cue is skipped, while a user cancellation ends the whole sequence.
 */
export class CueQueue {
  #runner: CueRunner;
  #handlers: CueQueueHandlers;
  #items: Cue[] = [];
  #index = -1;
  #active = false;
  #generation = 0;
  #runPromise: Promise<void> | null = null;

  constructor(runner: CueRunner, handlers: CueQueueHandlers = {}) {
    this.#runner = runner;
    this.#handlers = handlers;
  }

  get state(): CueQueueState {
    return {
      active: this.#active,
      index: this.#index,
      total: this.#items.length,
      current: this.#index >= 0 ? (this.#items[this.#index] ?? null) : null,
    };
  }

  get active(): boolean {
    return this.#active;
  }

  play(cues: readonly Cue[]): Promise<void> {
    this.cancel(false);
    this.#items = cues.slice();
    this.#index = -1;
    this.#active = this.#items.length > 0;
    this.#generation += 1;
    this.#publish();
    if (!this.#active) {
      this.#handlers.onFinished?.();
      return Promise.resolve();
    }
    const generation = this.#generation;
    const promise = this.#run(generation);
    this.#runPromise = promise;
    return promise;
  }

  /** End the current cue and the rest of the queue. */
  cancel(notify = true): void {
    if (!this.#active && this.#runPromise === null) return;
    this.#generation += 1;
    this.#runner.cancel?.();
    this.#active = false;
    if (notify) {
      const current = this.#items[this.#index];
      if (current) this.#handlers.onSkipped?.(current, this.#index, 'cancelled');
      this.#handlers.onFinished?.();
    }
    this.#publish();
    this.#runPromise = null;
  }

  /** Skip the current cue and start the next one. */
  next(): void {
    if (!this.#active) return;
    this.#runner.cancel?.();
    this.#generation += 1;
    const generation = this.#generation;
    void this.#run(generation);
  }

  /** Replay the previous cue when a sequence is active. */
  previous(): void {
    if (!this.#active || this.#index <= 0) return;
    this.#runner.cancel?.();
    this.#generation += 1;
    this.#index -= 2;
    void this.#run(this.#generation);
  }

  async wait(): Promise<void> {
    await this.#runPromise;
  }

  async #run(generation: number): Promise<void> {
    while (this.#active && generation === this.#generation) {
      this.#index += 1;
      const cue = this.#items[this.#index];
      if (!cue) {
        this.#active = false;
        this.#publish();
        this.#handlers.onFinished?.();
        return;
      }
      this.#publish();
      let played = false;
      try {
        played = await this.#runner.run(cue, this.#index, this.#items.length);
      } catch {
        played = false;
      }
      if (generation !== this.#generation || !this.#active) return;
      if (!played) this.#handlers.onSkipped?.(cue, this.#index, 'failed');
    }
  }

  #publish(): void {
    this.#handlers.onState?.(this.state);
  }
}

export function makePlayerCueSequence<T>(
  items: readonly T[],
  toCue: (item: T, index: number) => Cue | null,
): Cue[] {
  return items.map(toCue).filter((cue): cue is Cue => cue !== null);
}
