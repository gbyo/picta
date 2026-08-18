/** Event names exchanged between the controller and the presentation window. */

import type { BoardData, Cue, LayoutNode } from '../core/domain.js';
import type { ZoneRect } from '../core/layouts.js';
import type { BoardRow as LegacyBoardRow } from '../core/lineup.js';
import type { ImageSizing, Layout, Transition } from '../core/types.js';

export const EVENT_SHOW = 'picta://present-show';
export const EVENT_CLEAR = 'picta://present-clear';
export const EVENT_RESULT = 'picta://present-result';
export const EVENT_READY = 'picta://present-ready';
export const EVENT_KEY = 'picta://present-key';
export const EVENT_MENU = 'picta://menu';
export const EVENT_TAKEOVER = 'picta://present-takeover';
export const EVENT_TAKEOVER_END = 'picta://present-takeover-end';
export const EVENT_LAYOUT = 'picta://present-layout';
export const EVENT_BOARD = 'picta://present-board';
export const EVENT_BACKGROUND = 'picta://present-background';
export const EVENT_CUE = 'picta://present-cue';
export const EVENT_CUE_END = 'picta://present-cue-end';
export const EVENT_PLAYBACK = 'picta://present-playback';
export const EVENT_THEME = 'picta://present-theme';
export const EVENT_LAYOUT_EDIT_BEGIN = 'picta://present-layout-edit-begin';
export const EVENT_LAYOUT_EDIT_UPDATE = 'picta://present-layout-edit-update';
export const EVENT_LAYOUT_EDIT_END = 'picta://present-layout-edit-end';

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

export type PlaybackEvent =
  | { token: number; event: 'ready' | 'started' | 'ended' | 'failed'; ok: boolean; zoneId?: string }
  | { token: number; event: 'cancelled'; ok: true; zoneId?: string };

export interface ResultMessage {
  token: number;
  ok: boolean;
  zoneId?: string;
}

export interface KeyMessage {
  key: string;
}

/** Which way the output display is divided. */
export interface LayoutMessage {
  layout: Layout | LayoutNode;
}

export interface LayoutEditZone extends ZoneRect {
  number: number;
  sharePercent: number;
}

export interface LayoutEditPreviewMessage {
  layout: LayoutNode;
  outputWidth: number;
  outputHeight: number;
  zones: LayoutEditZone[];
  selectedZoneId: string | null;
  showSafeAreas: boolean;
}

/**
 * The on-court board. Rows arrive pre-formatted for the same reason takeover
 * stats do: one implementation of the box-score rules, in the controller.
 */
export interface BoardMessage {
  rows?: LegacyBoardRow[];
  data?: BoardData;
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

export interface BackgroundMediaMessage {
  token: number;
  zoneId?: string;
  src: string;
  type?: 'image' | 'video';
  sizing: ImageSizing;
  transition: Transition;
  fadeMs: number;
  muted?: boolean;
}

export interface CueMessage {
  cue: Cue;
  token?: number;
  src?: string;
  /** Optional asset-protocol source for player photos. */
  photoSrc?: string;
}

export interface ThemeMessage {
  primary: string;
  secondary: string;
  foreground: string;
  background: 'black' | 'primary' | 'secondary';
}
