/**
 * Shared value types for Picta.
 *
 * Everything in `src/core` is pure: no Tauri imports, no DOM, no I/O.
 * That keeps the interesting logic (path handling, `.picta` parsing, monitor
 * matching, playback ordering, timers) testable without real hardware.
 */

import type { Player } from './stats.js';

export type Transition = 'none' | 'crossfade';
export type ImageSizing = 'fit' | 'fill';

/**
 * How the output display is divided.
 *
 * `full` is one image filling the screen. `split` puts the image rotation on the
 * left half and a live on-court stats panel on the right, which is what an
 * ultrawide screen at a match is for.
 */
export type Layout = 'full' | 'split';

export const TRANSITIONS: readonly Transition[] = ['none', 'crossfade'];
export const IMAGE_SIZINGS: readonly ImageSizing[] = ['fit', 'fill'];
export const LAYOUTS: readonly Layout[] = ['full', 'split'];

export const DEFAULT_INTERVAL_SECONDS = 10;
export const DEFAULT_TRANSITION: Transition = 'crossfade';
export const DEFAULT_IMAGE_SIZING: ImageSizing = 'fit';
export const DEFAULT_LAYOUT: Layout = 'full';

/** Crossfade length. Deliberately not user-configurable. */
export const CROSSFADE_MS = 300;

export const INTERVAL_CHOICES: readonly number[] = [3, 5, 10, 15, 20, 30, 60];

/** Smallest / largest interval Picta will accept from a `.picta` file or the UI. */
export const MIN_INTERVAL_SECONDS = 1;
export const MAX_INTERVAL_SECONDS = 86_400;

export const SUPPORTED_IMAGE_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp'];

/** One image in the show, as held in memory by the controller. */
export interface ImageItem {
  /** Absolute, platform-native path. Never copied into app storage. */
  readonly path: string;
  /** Set when the file could not be found on disk at load/refresh time. */
  missing: boolean;
}

/** The part of the application state that a `.picta` file describes. */
export interface DocumentData {
  images: ImageItem[];
  intervalSeconds: number;
  transition: Transition;
  imageSizing: ImageSizing;
  layout: Layout;
  /**
   * Optional volleyball roster. Empty for an ordinary image show, which is
   * what keeps Picta's core workflow unchanged by this feature.
   */
  roster: Player[];
}

export function defaultDocumentData(): DocumentData {
  return {
    images: [],
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    transition: DEFAULT_TRANSITION,
    imageSizing: DEFAULT_IMAGE_SIZING,
    layout: DEFAULT_LAYOUT,
    roster: [],
  };
}

export function isSupportedImagePath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = path.slice(dot + 1).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

export function isTransition(value: unknown): value is Transition {
  return typeof value === 'string' && (TRANSITIONS as readonly string[]).includes(value);
}

export function isImageSizing(value: unknown): value is ImageSizing {
  return typeof value === 'string' && (IMAGE_SIZINGS as readonly string[]).includes(value);
}

export function isLayout(value: unknown): value is Layout {
  return typeof value === 'string' && (LAYOUTS as readonly string[]).includes(value);
}

export function isValidInterval(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_INTERVAL_SECONDS &&
    value <= MAX_INTERVAL_SECONDS
  );
}
