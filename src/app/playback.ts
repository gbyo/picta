/**
 * The running show.
 *
 * Owns the advance timer, the current index and the conversation with the
 * presentation window. Deliberately separate from the UI so the rules stay
 * legible:
 *
 *  - An image is only counted as shown once the presentation confirms it
 *    decoded, and the interval timer starts from that moment.
 *  - A manual Previous/Next grants the new image a fresh full interval.
 *  - An image that fails to decode (deleted mid-show, corrupt, unreadable) is
 *    skipped permanently for this run and never surfaces on the output display.
 *  - When nothing is left that can be shown, the show stops rather than
 *    spinning.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';

import {
  EVENT_CLEAR,
  EVENT_KEY,
  EVENT_READY,
  EVENT_RESULT,
  EVENT_SHOW,
  EVENT_TAKEOVER,
  EVENT_TAKEOVER_END,
} from './events.js';
import type { KeyMessage, ShowResult, TakeoverRequest } from './events.js';
import { DoubleBuffer } from '../core/transition.js';
import { AdvanceTimer, realTimerHost } from '../core/scheduler.js';
import { firstPlayable, playablePosition, stepIndex } from '../core/playlist.js';
import { CROSSFADE_MS, type ImageItem, type ImageSizing, type Transition } from '../core/types.js';

const PRESENTATION_LABEL = 'presentation';
/** How long to wait for the presentation webview to attach its listeners. */
const READY_TIMEOUT_MS = 5000;
/** Sweep length for a player takeover. Not exposed in the interface. */
export const TAKEOVER_SWEEP_MS = 480;

export interface PlaybackSettings {
  intervalSeconds: number;
  transition: Transition;
  imageSizing: ImageSizing;
}

export type StopReason = 'user' | 'exhausted' | 'display-lost';

export interface PlaybackHandlers {
  onPosition(position: number, total: number): void;
  onStopped(reason: StopReason): void;
  onKey(key: string): void;
  /** Called when a takeover starts and when it finishes. */
  onTakeover(active: boolean): void;
}

export class Playback {
  #handlers: PlaybackHandlers;
  #buffer = new DoubleBuffer();
  #timer: AdvanceTimer;
  #images: readonly ImageItem[] = [];
  #settings: PlaybackSettings = {
    intervalSeconds: 10,
    transition: 'crossfade',
    imageSizing: 'fit',
  };
  /** Paths that failed to decode during this run. */
  #skip = new Set<string>();
  #active = false;
  #unlisten: UnlistenFn[] = [];
  /** Set while a player card is covering the images. */
  #takeover = false;
  #takeoverTimer: number | null = null;
  /** Set when the presentation webview reports its listeners are attached. */
  #ready = false;
  #readyWaiters: (() => void)[] = [];

  constructor(handlers: PlaybackHandlers) {
    this.#handlers = handlers;
    this.#timer = new AdvanceTimer(realTimerHost, 10_000, () => this.#advance(1));
  }

  get active(): boolean {
    return this.#active;
  }

  get takeoverActive(): boolean {
    return this.#takeover;
  }

  /** Attach the listeners that live for the lifetime of the controller. */
  async init(): Promise<void> {
    this.#unlisten.push(
      await listen<ShowResult>(EVENT_RESULT, (event) => this.#onResult(event.payload)),
    );
    this.#unlisten.push(
      await listen<KeyMessage>(EVENT_KEY, (event) => {
        if (this.#active) this.#handlers.onKey(event.payload.key);
      }),
    );
    // Registered for the whole life of the controller so a presentation window
    // that loads faster than the start sequence cannot be missed.
    this.#unlisten.push(
      await listen(EVENT_READY, () => {
        this.#ready = true;
        const waiters = this.#readyWaiters;
        this.#readyWaiters = [];
        for (const resolve of waiters) resolve();
      }),
    );
  }

  /** Call immediately before creating a new presentation window. */
  resetReady(): void {
    this.#ready = false;
    this.#readyWaiters = [];
  }

  async dispose(): Promise<void> {
    this.#clearTakeoverState();
    this.#timer.cancel();
    for (const off of this.#unlisten) off();
    this.#unlisten = [];
  }

  /**
   * Begin playback. The presentation window must already be open and confirmed
   * to be on the chosen display.
   */
  async begin(images: readonly ImageItem[], settings: PlaybackSettings): Promise<boolean> {
    this.#images = images;
    this.#settings = settings;
    this.#skip.clear();
    this.#buffer.reset();
    this.#clearTakeoverState();
    this.#timer.setInterval(settings.intervalSeconds * 1000);
    this.#active = true;

    await this.#waitForPresentation();

    const start = firstPlayable(this.#images, 0, this.#skip);
    if (start === null) {
      this.stop('exhausted');
      return false;
    }
    this.#show(start);
    return true;
  }

  stop(reason: StopReason = 'user'): void {
    if (!this.#active) return;
    this.#active = false;
    this.#clearTakeoverState();
    this.#timer.cancel();
    this.#buffer.abandon();
    void emitTo(PRESENTATION_LABEL, EVENT_CLEAR, {}).catch(() => undefined);
    this.#handlers.onStopped(reason);
  }

  next(): void {
    this.#advance(1);
  }

  previous(): void {
    this.#advance(-1);
  }

  /** The presentation was hidden out from under us; do not touch it again. */
  abandon(): void {
    this.#active = false;
    this.#clearTakeoverState();
    this.#timer.cancel();
    this.#buffer.abandon();
  }

  /** Drop takeover state without touching a presentation that may be gone. */
  #clearTakeoverState(): void {
    if (this.#takeoverTimer !== null) {
      window.clearTimeout(this.#takeoverTimer);
      this.#takeoverTimer = null;
    }
    if (this.#takeover) {
      this.#takeover = false;
      this.#handlers.onTakeover(false);
    }
  }

  /**
   * Sweep a player card over the images for `holdMs`, then return to the show.
   *
   * Image advancement is suspended for the duration rather than left running
   * underneath: coming back to a different image than the one the card covered
   * would look like a glitch. The image itself is never disturbed, so the show
   * resumes exactly where it paused, and the interval restarts from the moment
   * the card leaves.
   */
  takeover(request: Omit<TakeoverRequest, 'sweepMs'>, holdMs: number): void {
    if (!this.#active) return;

    this.#timer.cancel();
    if (this.#takeoverTimer !== null) window.clearTimeout(this.#takeoverTimer);

    const wasActive = this.#takeover;
    this.#takeover = true;
    if (!wasActive) this.#handlers.onTakeover(true);

    void emitTo(PRESENTATION_LABEL, EVENT_TAKEOVER, {
      ...request,
      sweepMs: TAKEOVER_SWEEP_MS,
    }).catch(() => this.stop('display-lost'));

    this.#takeoverTimer = window.setTimeout(
      () => {
        this.#takeoverTimer = null;
        this.endTakeover();
      },
      Math.max(holdMs, TAKEOVER_SWEEP_MS),
    );
  }

  /** Sweep the card away and hand the screen back to the images. */
  endTakeover(): void {
    if (this.#takeoverTimer !== null) {
      window.clearTimeout(this.#takeoverTimer);
      this.#takeoverTimer = null;
    }
    if (!this.#takeover) return;
    this.#takeover = false;

    void emitTo(PRESENTATION_LABEL, EVENT_TAKEOVER_END, {}).catch(() => undefined);
    this.#handlers.onTakeover(false);

    // The image underneath never changed, so the show simply continues — with a
    // full interval, since the operator has just been looking at something else.
    if (this.#active) this.#timer.restart();
  }

  #advance(direction: 1 | -1): void {
    if (!this.#active) return;
    // Moving through the show implies leaving the card: the operator wants the
    // images back.
    if (this.#takeover) this.endTakeover();
    // A manual step supersedes any pending load, and always restarts the clock.
    this.#timer.cancel();
    const next = stepIndex(this.#images, this.#buffer.shownIndex, direction, this.#skip);
    if (next === null) {
      this.stop('exhausted');
      return;
    }
    this.#show(next);
  }

  #show(index: number): void {
    const item = this.#images[index];
    if (!item) {
      this.stop('exhausted');
      return;
    }
    const request = this.#buffer.request(item.path, index);
    void emitTo(PRESENTATION_LABEL, EVENT_SHOW, {
      token: request.token,
      src: convertFileSrc(item.path),
      sizing: this.#settings.imageSizing,
      transition: this.#settings.transition,
      fadeMs: CROSSFADE_MS,
    }).catch(() => this.stop('display-lost'));
  }

  #onResult(result: ShowResult): void {
    if (!this.#active) return;

    if (result.ok) {
      const outcome = this.#buffer.decoded(result.token);
      if (outcome.kind !== 'swap') return;
      // The clock starts when the image is actually on screen, not when it was
      // requested, so a slow decode never shortens an interval. While a card is
      // up, the clock stays stopped until it leaves.
      if (!this.#takeover) this.#timer.restart();
      const { position, total } = playablePosition(this.#images, outcome.request.index, this.#skip);
      this.#handlers.onPosition(position, total);
      return;
    }

    const outcome = this.#buffer.failed(result.token);
    if (outcome.kind !== 'failed') return;
    // Retire this file for the rest of the run and move straight on. Nothing
    // about the failure ever reaches the output display.
    this.#skip.add(outcome.request.path);
    this.#advance(1);
  }

  #waitForPresentation(): Promise<void> {
    if (this.#ready) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      };
      // Showing a still image a fraction late is far better than never showing
      // one because a ready signal went astray.
      const timeout = window.setTimeout(done, READY_TIMEOUT_MS);
      this.#readyWaiters.push(done);
    });
  }

  /** Number of images this run can still show. */
  playableCount(): number {
    return playablePosition(this.#images, this.#buffer.shownIndex, this.#skip).total;
  }
}
