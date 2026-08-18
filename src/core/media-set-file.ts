/** Parser and serializer for reusable `.pictaset` files. */

import type { MediaItem, MediaSet } from './domain.js';
import {
  DEFAULT_MEDIA_DURATION_SECONDS,
  isSupportedMediaPath,
  mediaTypeForPath,
  validateMediaItem,
} from './media.js';
import { resolveStoredPath, storedPathFor, type PathStyle } from './paths.js';

export const MEDIA_SET_FORMAT_VERSION = 1;
export const MEDIA_SET_MAX_SUPPORTED_VERSION = 1;

export type MediaSetParseErrorKind =
  | 'invalid-json'
  | 'not-an-object'
  | 'missing-version'
  | 'unsupported-version'
  | 'invalid-media-set'
  | 'invalid-item';

export type MediaSetParseResult =
  { ok: true; value: MediaSet } | { ok: false; kind: MediaSetParseErrorKind; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(kind: MediaSetParseErrorKind, message: string): MediaSetParseResult {
  return { ok: false, kind, message };
}

function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 86_400;
}

export function parseMediaSet(text: string): MediaSetParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'This media-set file is not valid JSON.');
  }
  if (!isObject(raw)) return fail('not-an-object', 'This does not look like a Picta media set.');
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return fail('missing-version', 'This media set has no valid version.');
  if (version > MEDIA_SET_MAX_SUPPORTED_VERSION)
    return fail(
      'unsupported-version',
      `This media set uses version ${version}. Update Picta to open it.`,
    );
  if (typeof raw['name'] !== 'string' || raw['name'].trim() === '' || !Array.isArray(raw['items']))
    return fail('invalid-media-set', 'A media set needs a name and items array.');
  const transition = raw['transition'] ?? 'crossfade';
  if (transition !== 'none' && transition !== 'crossfade')
    return fail('invalid-media-set', 'This media set has an invalid transition.');
  const imageSizing = raw['imageSizing'] ?? 'fit';
  if (imageSizing !== 'fit' && imageSizing !== 'fill')
    return fail('invalid-media-set', 'This media set has invalid image sizing.');
  const duration =
    raw['imageDurationSeconds'] ?? raw['durationSeconds'] ?? DEFAULT_MEDIA_DURATION_SECONDS;
  if (!validDuration(duration))
    return fail('invalid-media-set', 'This media set has an invalid image duration.');
  const items: MediaItem[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw['items'].length; i += 1) {
    const error = validateMediaItem(raw['items'][i], `Media item ${i + 1}`);
    if (error) return fail('invalid-item', error);
    const value = raw['items'][i] as Record<string, unknown>;
    const id = value['id'] as string;
    if (ids.has(id)) return fail('invalid-item', `Media item ${i + 1} duplicates id "${id}".`);
    ids.add(id);
    if (!isSupportedMediaPath(value['path'] as string))
      return fail('invalid-item', `Media item ${i + 1} uses an unsupported file.`);
    const type = mediaTypeForPath(value['path'] as string);
    if (!type) return fail('invalid-item', `Media item ${i + 1} uses an unsupported file.`);
    items.push({
      id,
      type,
      path: value['path'] as string,
      ...(value['durationSeconds'] === undefined
        ? {}
        : { durationSeconds: value['durationSeconds'] as number }),
    });
  }
  return {
    ok: true,
    value: {
      version: 1,
      name: raw['name'].trim(),
      items,
      transition,
      imageSizing,
      imageDurationSeconds: duration,
    },
  };
}

export function serializeMediaSet(set: MediaSet, filePath: string, style: PathStyle): string {
  const body = {
    version: MEDIA_SET_FORMAT_VERSION,
    name: set.name,
    items: set.items.map((item) => ({
      id: item.id,
      type: item.type,
      path: storedPathFor(item.path, filePath, style),
      ...(item.durationSeconds === undefined ? {} : { durationSeconds: item.durationSeconds }),
    })),
    transition: set.transition,
    imageSizing: set.imageSizing,
    imageDurationSeconds: set.imageDurationSeconds,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

export function resolveMediaSetPaths(set: MediaSet, filePath: string, style: PathStyle): MediaSet {
  return {
    ...set,
    items: set.items.map((item) => ({
      ...item,
      path: resolveStoredPath(item.path, filePath, style),
    })),
  };
}
