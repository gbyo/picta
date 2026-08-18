/** Event names exchanged between the controller and the presentation window. */

import type { ImageSizing, Transition } from '../core/types.js';

export const EVENT_SHOW = 'picta://present-show';
export const EVENT_CLEAR = 'picta://present-clear';
export const EVENT_RESULT = 'picta://present-result';
export const EVENT_READY = 'picta://present-ready';
export const EVENT_KEY = 'picta://present-key';
export const EVENT_MENU = 'picta://menu';
export const EVENT_TAKEOVER = 'picta://present-takeover';
export const EVENT_TAKEOVER_END = 'picta://present-takeover-end';

export interface ShowRequest {
  token: number;
  src: string;
  sizing: ImageSizing;
  transition: Transition;
  fadeMs: number;
}

export interface ShowResult {
  token: number;
  ok: boolean;
}

export interface KeyMessage {
  key: string;
}

/**
 * A player card to sweep over the images. The controller sends finished strings
 * only — the presentation window does no arithmetic and no formatting, so there
 * is exactly one implementation of the box-score rules.
 */
export interface TakeoverRequest {
  number: string;
  name: string;
  position: string;
  stats: { label: string; value: string }[];
  /** Crossfade-scale sweep, in milliseconds. */
  sweepMs: number;
}
