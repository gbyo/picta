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
  DEFAULT_LAYOUT,
  isImageSizing,
  isLayout,
  isTransition,
  isValidInterval,
  type DocumentData,
  type ImageSizing,
  type Layout,
  type Transition,
} from './types.js';
import { resolveStoredPath, storedPathFor, type PathStyle } from './paths.js';
import { emptyStats, STAT_KEYS, type Player, type PlayerStats } from './stats.js';

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
  | 'invalid-roster'
  | 'invalid-field';

export interface ParsedPicta {
  version: number;
  /** Paths exactly as stored in the file (forward slashes, possibly relative). */
  storedPaths: string[];
  intervalSeconds: number;
  transition: Transition;
  imageSizing: ImageSizing;
  layout: Layout;
  /** Empty unless the file carries a roster. */
  roster: Player[];
}

export type ParseResult =
  { ok: true; value: ParsedPicta } | { ok: false; kind: ParseErrorKind; message: string };

function fail(kind: ParseErrorKind, message: string): ParseResult {
  return { ok: false, kind, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Internal helper so nested parsers can return either a value or an error. */
type Attempt<T> = { ok: true; value: T } | { ok: false; error: ParseResult };

function bad<T>(kind: ParseErrorKind, message: string): Attempt<T> {
  return { ok: false, error: fail(kind, message) };
}

/**
 * Read one player's counters.
 *
 * Missing counters default to zero so a roster written by a future Picta that
 * tracks one more statistic still opens here. A present-but-invalid counter is
 * an error, for the same reason a bad `intervalSeconds` is.
 */
function parseStats(raw: unknown, playerNumber: number): Attempt<PlayerStats> {
  const stats = emptyStats();
  if (raw === undefined) return { ok: true, value: stats };
  if (!isPlainObject(raw)) {
    return bad('invalid-roster', `Player ${playerNumber} in this Picta file has invalid stats.`);
  }
  for (const key of STAT_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    // Counters are whole, non-negative event counts. Anything else means the
    // file was edited by something that did not understand it.
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return bad(
        'invalid-roster',
        `Player ${playerNumber} in this Picta file has an invalid "${key}" value.`,
      );
    }
    stats[key] = value;
  }
  return { ok: true, value: stats };
}

/**
 * Read the optional roster.
 *
 * Ids are generated on load rather than stored: they only have to be unique
 * within one running copy of Picta, and generating them means a hand-written
 * roster does not need to invent them.
 */
function parseRoster(raw: unknown): Attempt<Player[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return bad('invalid-roster', 'This Picta file has an invalid "roster" value.');
  }

  const roster: Player[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i] as unknown;
    if (!isPlainObject(entry)) {
      return bad('invalid-roster', `Roster entry ${i + 1} in this Picta file is not valid.`);
    }
    const name = entry['name'];
    if (typeof name !== 'string' || name.trim() === '') {
      return bad('invalid-roster', `Roster entry ${i + 1} in this Picta file has no name.`);
    }
    const number = entry['number'];
    if (number !== undefined && typeof number !== 'string' && typeof number !== 'number') {
      return bad(
        'invalid-roster',
        `Roster entry ${i + 1} in this Picta file has an invalid number.`,
      );
    }
    const position = entry['position'];
    if (position !== undefined && typeof position !== 'string') {
      return bad(
        'invalid-roster',
        `Roster entry ${i + 1} in this Picta file has an invalid position.`,
      );
    }

    const stats = parseStats(entry['stats'], i + 1);
    if (!stats.ok) return stats;

    roster.push({
      // Ids are runtime-only: unique within this copy of Picta is enough, and
      // generating them means a hand-written roster need not invent any.
      id: `p${i}_${Math.random().toString(36).slice(2, 8)}`,
      number: number === undefined ? '' : String(number).trim(),
      name: name.trim(),
      position: position === undefined ? '' : position.trim(),
      stats: stats.value,
      // Anything other than an explicit `true` leaves the player on the bench.
      onCourt: entry['onCourt'] === true,
    });
  }
  return { ok: true, value: roster };
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

  const layoutRaw = obj['layout'];
  let layout: Layout = DEFAULT_LAYOUT;
  if (layoutRaw !== undefined) {
    if (!isLayout(layoutRaw)) {
      return fail('invalid-field', 'This Picta file has an invalid "layout" value.');
    }
    layout = layoutRaw;
  }

  const roster = parseRoster(obj['roster']);
  if (!roster.ok) return roster.error;

  // Unknown keys are ignored on purpose: a future minor addition stays readable.
  return {
    ok: true,
    value: {
      version,
      storedPaths,
      intervalSeconds,
      transition,
      imageSizing,
      layout,
      roster: roster.value,
    },
  };
}

/** Serialize document state to `.picta` text, relative to `pictaFilePath`. */
export function serializePicta(
  doc: Pick<DocumentData, 'intervalSeconds' | 'transition' | 'imageSizing' | 'layout'> & {
    images: readonly { path: string }[];
    roster?: readonly Player[];
  },
  pictaFilePath: string,
  style: PathStyle,
): string {
  const body: Record<string, unknown> = {
    version: PICTA_FORMAT_VERSION,
    images: doc.images.map((image) => ({ path: storedPathFor(image.path, pictaFilePath, style) })),
    intervalSeconds: doc.intervalSeconds,
    transition: doc.transition,
    imageSizing: doc.imageSizing,
    layout: doc.layout,
  };

  // Written only when there is one, so a plain image show stays exactly as small
  // and as readable as it was before rosters existed.
  if (doc.roster && doc.roster.length > 0) {
    body['roster'] = doc.roster.map((player) => ({
      number: player.number,
      name: player.name,
      position: player.position,
      // Ids are runtime-only. Zero counters and bench players are omitted, both
      // being the default, which keeps the file small and diff-friendly.
      ...(player.onCourt ? { onCourt: true } : {}),
      stats: Object.fromEntries(
        STAT_KEYS.filter((key) => player.stats[key] !== 0).map((key) => [key, player.stats[key]]),
      ),
    }));
  }

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

// v2 has its own parser and serializer, but exporting them from this module
// gives callers one natural place to discover the complete `.picta` API while
// keeping parsePicta itself permanently v1-compatible.
export {
  migratePictaV1,
  parsePictaV2,
  serializePictaV2,
  resolveShowPaths,
  PICTA_V2_FORMAT_VERSION,
} from './show-file.js';
