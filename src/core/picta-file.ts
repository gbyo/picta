/**
 * Reading and writing the `.picta` document format.
 *
 * A `.picta` file is treated as *data only*. Nothing in it is ever executed,
 * and anything outside the documented schema is either ignored (unknown
 * optional fields) or rejected with a clear message. See docs/picta-format.md.
 */

import {
  DEFAULT_IMAGE_SIZING,
  DEFAULT_TRANSITION,
  DEFAULT_INTERVAL_SECONDS,
  isImageSizing,
  isTransition,
  isValidInterval,
  type DocumentData,
  type ImageSizing,
  type Transition,
} from './types.js';
import { resolveStoredPath, storedPathFor, type PathStyle } from './paths.js';

/** The only format version this build of Picta writes. */
export const PICTA_FORMAT_VERSION = 1;

/** Highest format version this build of Picta can read. */
export const PICTA_MAX_SUPPORTED_VERSION = 1;

export type ParseErrorKind =
  | 'invalid-json'
  | 'not-an-object'
  | 'missing-version'
  | 'unsupported-version'
  | 'invalid-images'
  | 'invalid-field';

export interface ParsedPicta {
  version: number;
  /** Paths exactly as stored in the file (forward slashes, possibly relative). */
  storedPaths: string[];
  intervalSeconds: number;
  transition: Transition;
  imageSizing: ImageSizing;
}

export type ParseResult =
  { ok: true; value: ParsedPicta } | { ok: false; kind: ParseErrorKind; message: string };

function fail(kind: ParseErrorKind, message: string): ParseResult {
  return { ok: false, kind, message };
}

/**
 * Parse `.picta` text. Never throws: malformed input always comes back as a
 * structured error so the controller can show a sentence instead of crashing.
 */
export function parsePicta(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('invalid-json', 'This file is not valid JSON, so it could not be opened.');
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('not-an-object', 'This does not look like a Picta file.');
  }
  const obj = raw as Record<string, unknown>;

  const version = obj['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail(
      'missing-version',
      'This does not look like a Picta file (missing format version).',
    );
  }
  if (version > PICTA_MAX_SUPPORTED_VERSION) {
    return fail(
      'unsupported-version',
      `This file uses Picta format version ${version}. This copy of Picta supports up to version ${PICTA_MAX_SUPPORTED_VERSION}. Update Picta to open it.`,
    );
  }

  const imagesRaw = obj['images'];
  if (!Array.isArray(imagesRaw)) {
    return fail('invalid-images', 'This Picta file has no valid image list.');
  }

  const storedPaths: string[] = [];
  for (let i = 0; i < imagesRaw.length; i += 1) {
    const entry = imagesRaw[i] as unknown;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return fail('invalid-images', `Image entry ${i + 1} in this Picta file is not valid.`);
    }
    const path = (entry as Record<string, unknown>)['path'];
    if (typeof path !== 'string' || path.trim() === '') {
      return fail('invalid-images', `Image entry ${i + 1} in this Picta file has no path.`);
    }
    storedPaths.push(path);
  }

  // Optional fields fall back to defaults, but a present-and-wrong value is an
  // error rather than a silent reset: it usually means a hand-edit went wrong.
  const intervalRaw = obj['intervalSeconds'];
  let intervalSeconds = DEFAULT_INTERVAL_SECONDS;
  if (intervalRaw !== undefined) {
    if (!isValidInterval(intervalRaw)) {
      return fail('invalid-field', 'This Picta file has an invalid "intervalSeconds" value.');
    }
    intervalSeconds = intervalRaw;
  }

  const transitionRaw = obj['transition'];
  let transition: Transition = DEFAULT_TRANSITION;
  if (transitionRaw !== undefined) {
    if (!isTransition(transitionRaw)) {
      return fail('invalid-field', 'This Picta file has an invalid "transition" value.');
    }
    transition = transitionRaw;
  }

  const sizingRaw = obj['imageSizing'];
  let imageSizing: ImageSizing = DEFAULT_IMAGE_SIZING;
  if (sizingRaw !== undefined) {
    if (!isImageSizing(sizingRaw)) {
      return fail('invalid-field', 'This Picta file has an invalid "imageSizing" value.');
    }
    imageSizing = sizingRaw;
  }

  // Unknown keys are ignored on purpose: a future minor addition stays readable.
  return { ok: true, value: { version, storedPaths, intervalSeconds, transition, imageSizing } };
}

/** Serialize document state to `.picta` text, relative to `pictaFilePath`. */
export function serializePicta(
  doc: Pick<DocumentData, 'intervalSeconds' | 'transition' | 'imageSizing'> & {
    images: readonly { path: string }[];
  },
  pictaFilePath: string,
  style: PathStyle,
): string {
  const body = {
    version: PICTA_FORMAT_VERSION,
    images: doc.images.map((image) => ({ path: storedPathFor(image.path, pictaFilePath, style) })),
    intervalSeconds: doc.intervalSeconds,
    transition: doc.transition,
    imageSizing: doc.imageSizing,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Turn parsed stored paths into absolute, platform-native paths. */
export function resolveParsedPaths(
  parsed: ParsedPicta,
  pictaFilePath: string,
  style: PathStyle,
): string[] {
  return parsed.storedPaths.map((stored) => resolveStoredPath(stored, pictaFilePath, style));
}
