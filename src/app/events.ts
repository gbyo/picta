/** Event names exchanged between the controller and the presentation window. */

import type { ImageSizing, Transition } from '../core/types.js';

export const EVENT_SHOW = 'picta://present-show';
export const EVENT_CLEAR = 'picta://present-clear';
export const EVENT_RESULT = 'picta://present-result';
export const EVENT_READY = 'picta://present-ready';
export const EVENT_KEY = 'picta://present-key';
export const EVENT_MENU = 'picta://menu';

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
