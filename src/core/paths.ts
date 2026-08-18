/**
 * Cross-platform path handling, written from scratch so it can be unit-tested
 * for *both* path styles regardless of which OS the tests run on.
 *
 * Rules Picta follows:
 *  - Paths inside a `.picta` file are always written with forward slashes.
 *  - Paths in memory are platform-native (backslashes on Windows).
 *  - A stored path is relative to the `.picta` file whenever both live on the
 *    same root (same drive / same UNC share); otherwise it falls back to
 *    absolute.
 */

export type PathStyle = 'posix' | 'win32';

export function separator(style: PathStyle): string {
  return style === 'win32' ? '\\' : '/';
}

/** Split on both separators; win32 accepts `/` too, posix only `/`. */
function splitRaw(path: string, style: PathStyle): string[] {
  return style === 'win32' ? path.split(/[\\/]+/) : path.split(/\/+/);
}

/**
 * Returns the root prefix of an absolute path, or '' when the path is relative.
 * Examples: `C:\a` -> `C:\`, `\\srv\share\a` -> `\\srv\share\`, `/a` -> `/`.
 */
export function pathRoot(path: string, style: PathStyle): string {
  if (style === 'posix') {
    return path.startsWith('/') ? '/' : '';
  }
  // UNC: \\server\share\...
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)/.exec(path);
  if (unc) return `\\\\${unc[1]}\\${unc[2]}\\`;
  const drive = /^([A-Za-z]:)[\\/]/.exec(path);
  if (drive) return `${drive[1]}\\`;
  return '';
}

export function isAbsolutePath(path: string, style: PathStyle): boolean {
  return pathRoot(path, style) !== '';
}

/** Root comparison is case-insensitive on Windows (`c:\` === `C:\`). */
export function sameRoot(a: string, b: string, style: PathStyle): boolean {
  const ra = pathRoot(a, style);
  const rb = pathRoot(b, style);
  if (ra === '' || rb === '') return false;
  return style === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/** Path segments after the root, with empty segments and `.` removed. */
export function segments(path: string, style: PathStyle): string[] {
  const root = pathRoot(path, style);
  const rest = path.slice(root.length);
  return splitRaw(rest, style).filter((s) => s !== '' && s !== '.');
}

/** Collapse `..` segments where possible. Leading `..` are preserved. */
export function normalizeSegments(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const seg of input) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') {
      const last = out[out.length - 1];
      if (last !== undefined && last !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(seg);
  }
  return out;
}

export function joinSegments(root: string, segs: readonly string[], style: PathStyle): string {
  const sep = separator(style);
  if (root === '') return segs.join(sep);
  // `root` already ends with a separator.
  return root + segs.join(sep);
}

export function dirname(path: string, style: PathStyle): string {
  const root = pathRoot(path, style);
  const segs = segments(path, style);
  if (segs.length <= 1) return root === '' ? '.' : root;
  return joinSegments(root, segs.slice(0, -1), style);
}

export function basename(path: string, style: PathStyle): string {
  const segs = segments(path, style);
  return segs.length === 0 ? '' : (segs[segs.length - 1] as string);
}

/** Normalize an absolute path (collapse `.`/`..`, unify separators). */
export function normalizeAbsolute(path: string, style: PathStyle): string {
  const root = pathRoot(path, style);
  return joinSegments(root, normalizeSegments(segments(path, style)), style);
}

/** Resolve a possibly-relative path against a base directory. */
export function resolvePath(baseDir: string, path: string, style: PathStyle): string {
  if (isAbsolutePath(path, style)) return normalizeAbsolute(path, style);
  const root = pathRoot(baseDir, style);
  const combined = [...segments(baseDir, style), ...splitRaw(path, style)];
  return joinSegments(root, normalizeSegments(combined), style);
}

/**
 * Path of `target` relative to directory `fromDir`, or `null` when they do not
 * share a root (different drive / UNC share) and an absolute path must be used.
 */
export function relativeFrom(fromDir: string, target: string, style: PathStyle): string | null {
  if (!isAbsolutePath(fromDir, style) || !isAbsolutePath(target, style)) return null;
  if (!sameRoot(fromDir, target, style)) return null;

  const from = normalizeSegments(segments(fromDir, style));
  const to = normalizeSegments(segments(target, style));
  const eq = (a: string, b: string) =>
    style === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    eq(from[common] as string, to[common] as string)
  ) {
    common += 1;
  }
  const up = new Array<string>(from.length - common).fill('..');
  const down = to.slice(common);
  const parts = [...up, ...down];
  return parts.length === 0 ? '.' : parts.join('/');
}

/** Convert a platform-native path to the forward-slash form stored in files. */
export function toStoredPath(path: string, style: PathStyle): string {
  return style === 'win32' ? path.replace(/\\/g, '/') : path;
}

/** Convert a stored (forward-slash) path back to platform-native form. */
export function fromStoredPath(path: string, style: PathStyle): string {
  return style === 'win32' ? path.replace(/\//g, '\\') : path;
}

/**
 * The path Picta writes into a `.picta` file for `imagePath`.
 * Relative when possible so the whole folder stays movable; absolute otherwise.
 */
export function storedPathFor(imagePath: string, pictaFilePath: string, style: PathStyle): string {
  const dir = dirname(normalizeAbsolute(pictaFilePath, style), style);
  const rel = relativeFrom(dir, normalizeAbsolute(imagePath, style), style);
  if (rel !== null) return rel;
  return toStoredPath(normalizeAbsolute(imagePath, style), style);
}

/** Inverse of {@link storedPathFor}. */
export function resolveStoredPath(stored: string, pictaFilePath: string, style: PathStyle): string {
  const dir = dirname(normalizeAbsolute(pictaFilePath, style), style);
  return resolvePath(dir, fromStoredPath(stored, style), style);
}

/** Trailing path segments, longest first: ["Images/a.png", "a.png"] etc. */
export function pathSuffixes(path: string, style: PathStyle): string[] {
  const segs = segments(path, style);
  const out: string[] = [];
  for (let start = 0; start < segs.length; start += 1) {
    out.push(segs.slice(start).join('/'));
  }
  return out;
}
