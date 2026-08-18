/** Mixed image/video playback rules without DOM or timers. */

import type { MediaItem, MediaSet, MediaType } from './domain.js';
import { mediaDurationSeconds, stepMediaIndex } from './media.js';

export type MediaPlaybackEvent =
  | { type: 'request'; token: number; index: number; item: MediaItem; mediaType: MediaType }
  | { type: 'wait-image'; index: number; durationMs: number }
  | { type: 'advance'; from: number; direction: 1 | -1 }
  | { type: 'failed'; index: number; path: string }
  | { type: 'stopped' };

export interface MediaPlaybackState {
  active: boolean;
  currentIndex: number;
  pendingIndex: number | null;
  skip: ReadonlySet<string>;
}

/**
 * Controller-side state machine for a Media Set.  A video advances only from
 * its ended event; an image advances only after the caller says it decoded and
 * its timer fires.  Each request has one token, preventing duplicate advances.
 */
export class MediaPlaybackMachine {
  #set: MediaSet;
  #state: MediaPlaybackState = {
    active: false,
    currentIndex: -1,
    pendingIndex: null,
    skip: new Set<string>(),
  };
  #token = 0;
  #pendingToken: number | null = null;

  constructor(set: MediaSet) {
    this.#set = set;
  }

  get state(): MediaPlaybackState {
    return { ...this.#state, skip: new Set(this.#state.skip) };
  }

  setMediaSet(set: MediaSet): void {
    this.stop();
    this.#set = set;
  }

  start(): MediaPlaybackEvent | null {
    this.#state = { active: true, currentIndex: -1, pendingIndex: null, skip: new Set() };
    return this.request(1);
  }

  /** Pause presentation while retaining the current item for an edit preview. */
  pause(): void {
    this.#token += 1;
    this.#pendingToken = null;
    this.#state = { ...this.#state, active: false, pendingIndex: null };
  }

  /** Resume the current item, or start from the first item if nothing was ready yet. */
  resume(): MediaPlaybackEvent | null {
    if (this.#state.active) return null;
    this.#state = { ...this.#state, active: true };
    return this.#state.currentIndex >= 0 ? this.replayCurrent() : this.request(1);
  }

  stop(): MediaPlaybackEvent {
    this.#token += 1;
    this.#pendingToken = null;
    this.#state = { ...this.#state, active: false, pendingIndex: null };
    return { type: 'stopped' };
  }

  request(direction: 1 | -1): MediaPlaybackEvent | null {
    if (!this.#state.active) return null;
    const index = stepMediaIndex(
      this.#set.items,
      this.#state.currentIndex,
      direction,
      this.#state.skip,
    );
    if (index === null) return this.stop();
    const item = this.#set.items[index];
    if (!item) return this.stop();
    this.#token += 1;
    this.#pendingToken = this.#token;
    this.#state = { ...this.#state, pendingIndex: index };
    return { type: 'request', token: this.#token, index, item, mediaType: item.type };
  }

  /** Report a decode/ready result for the most recent request. */
  ready(token: number): MediaPlaybackEvent | null {
    if (token !== this.#pendingToken || this.#state.pendingIndex === null) return null;
    const index = this.#state.pendingIndex;
    const item = this.#set.items[index];
    if (!item) return null;
    this.#pendingToken = null;
    this.#state = { ...this.#state, currentIndex: index, pendingIndex: null };
    return item.type === 'image'
      ? { type: 'wait-image', index, durationMs: mediaDurationSeconds(item, this.#set) * 1000 }
      : null;
  }

  /** A failed image/video never reaches output; it is skipped for this run. */
  failed(token: number): MediaPlaybackEvent | null {
    if (token !== this.#pendingToken || this.#state.pendingIndex === null) return null;
    const index = this.#state.pendingIndex;
    const item = this.#set.items[index];
    if (!item) return null;
    this.#pendingToken = null;
    const skip = new Set(this.#state.skip);
    skip.add(item.path);
    this.#state = { ...this.#state, pendingIndex: null, skip };
    return { type: 'failed', index, path: item.path };
  }

  imageTimerFired(index: number): MediaPlaybackEvent | null {
    if (!this.#state.active || this.#state.currentIndex !== index) return null;
    return this.request(1);
  }

  videoEnded(index: number): MediaPlaybackEvent | null {
    if (!this.#state.active || this.#state.currentIndex !== index) return null;
    return this.request(1);
  }

  next(): MediaPlaybackEvent | null {
    if (!this.#state.active) return null;
    const from = this.#state.currentIndex;
    const event = this.request(1);
    return event && event.type === 'stopped'
      ? event
      : event
        ? { type: 'advance', from, direction: 1 }
        : null;
  }

  previous(): MediaPlaybackEvent | null {
    if (!this.#state.active) return null;
    const from = this.#state.currentIndex;
    const event = this.request(-1);
    return event && event.type === 'stopped'
      ? event
      : event
        ? { type: 'advance', from, direction: -1 }
        : null;
  }

  /** Re-request the current item after a cue so its interval starts fresh. */
  replayCurrent(): MediaPlaybackEvent | null {
    if (!this.#state.active || this.#state.currentIndex < 0) return null;
    const item = this.#set.items[this.#state.currentIndex];
    if (!item) return null;
    this.#token += 1;
    this.#pendingToken = this.#token;
    this.#state = { ...this.#state, pendingIndex: this.#state.currentIndex };
    return {
      type: 'request',
      token: this.#token,
      index: this.#state.currentIndex,
      item,
      mediaType: item.type,
    };
  }
}
