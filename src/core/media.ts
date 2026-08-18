/** Pure media-set values and ordering helpers. */

import type { MediaItem, MediaSet, MediaType } from './domain.js';

export const SUPPORTED_MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'] as const;

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'webm'] as const;

export const DEFAULT_MEDIA_DURATION_SECONDS = 10;

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function mediaTypeForPath(path: string): MediaType | null {
  const extension = extensionOf(path);
  if ((SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) return 'image';
  if ((SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return 'video';
  return null;
}

export function isSupportedMediaPath(path: string): boolean {
  return mediaTypeForPath(path) !== null;
}

export function isSupportedImagePath(path: string): boolean {
  return mediaTypeForPath(path) === 'image';
}

export function isSupportedVideoPath(path: string): boolean {
  return mediaTypeForPath(path) === 'video';
}

export function defaultMediaSet(name = 'Untitled Media Set'): MediaSet {
  return {
    version: 1,
    name,
    items: [],
    transition: 'crossfade',
    imageSizing: 'fit',
    imageDurationSeconds: DEFAULT_MEDIA_DURATION_SECONDS,
  };
}

export function makeMediaItem(
  path: string,
  id = makeMediaId(),
  durationSeconds?: number,
): MediaItem | null {
  const type = mediaTypeForPath(path);
  if (type === null) return null;
  return { id, type, path, ...(durationSeconds === undefined ? {} : { durationSeconds }) };
}

let idCounter = 0;

/** IDs are opaque and persisted; this fallback is deterministic within a run. */
export function makeMediaId(): string {
  idCounter += 1;
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `media-${random}` : `media-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function appendMedia(
  set: MediaSet,
  paths: readonly string[],
  idFactory: () => string = makeMediaId,
): MediaSet {
  const existing = new Set(set.items.map((item) => item.path));
  const items = set.items.slice();
  for (const path of paths) {
    if (existing.has(path)) continue;
    const item = makeMediaItem(path, idFactory());
    if (!item) continue;
    existing.add(path);
    items.push(item);
  }
  return { ...set, items };
}

export function mediaDurationSeconds(item: MediaItem, set: MediaSet): number {
  const duration = item.durationSeconds ?? set.imageDurationSeconds;
  return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_MEDIA_DURATION_SECONDS;
}

export function moveMediaItem(items: readonly MediaItem[], from: number, to: number): MediaItem[] {
  const next = items.slice();
  if (from < 0 || from >= next.length) return next;
  const destination = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  if (item) next.splice(destination, 0, item);
  return next;
}

export function playableMediaIndexes(
  items: readonly MediaItem[],
  missing = new Set<string>(),
): number[] {
  return items.flatMap((item, index) => (missing.has(item.path) ? [] : [index]));
}

export function stepMediaIndex(
  items: readonly MediaItem[],
  current: number,
  direction: 1 | -1,
  missing: ReadonlySet<string> = new Set<string>(),
): number | null {
  if (items.length === 0) return null;
  const start = current < 0 || current >= items.length ? (direction === 1 ? -1 : 0) : current;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (((start + direction * offset) % items.length) + items.length) % items.length;
    const item = items[index];
    if (item && !missing.has(item.path)) return index;
  }
  return null;
}

export function validateMediaItem(item: unknown, label = 'media item'): string | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return `${label} must be an object.`;
  }
  const value = item as Record<string, unknown>;
  if (typeof value['id'] !== 'string' || value['id'].trim() === '') {
    return `${label} has no valid id.`;
  }
  if (value['type'] !== 'image' && value['type'] !== 'video') {
    return `${label} has an unsupported media type.`;
  }
  if (typeof value['path'] !== 'string' || value['path'].trim() === '') {
    return `${label} has no valid path.`;
  }
  if (mediaTypeForPath(value['path']) !== value['type']) {
    return `${label} has a path whose extension does not match its type.`;
  }
  const duration = value['durationSeconds'];
  if (
    duration !== undefined &&
    (typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration < 1 ||
      duration > 86_400)
  ) {
    return `${label} has an invalid duration.`;
  }
  return null;
}
