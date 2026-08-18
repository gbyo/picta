/**
 * Monitor identity and matching.
 *
 * The single most important rule in Picta: **a monitor array index is never an
 * identity**. Unplugging a TV renumbers everything the OS reports, and blindly
 * reusing "display 3" would put the show on whatever screen happens to be third
 * now — possibly a scoreboard. So Picta always matches on the stable-ish
 * attributes the OS exposes, and refuses to guess when the match is ambiguous.
 */

export interface DisplayInfo {
  /** Stable within one enumeration only. Never persisted as an identity. */
  readonly id: string;
  /** 1-based number shown in the UI and by Identify Displays. */
  readonly index: number;
  readonly name: string | null;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly scaleFactor: number;
  readonly isPrimary: boolean;
}

/** What Picta remembers about the chosen output between runs. */
export interface DisplayHint {
  readonly fingerprint: string;
  readonly name: string | null;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly x: number;
  readonly y: number;
}

export type MatchConfidence = 'exact' | 'ambiguous' | 'none';

export interface MatchResult {
  readonly display: DisplayInfo | null;
  readonly confidence: MatchConfidence;
}

/**
 * Identity built only from attributes that survive a reboot or a cable swap:
 * reported name, physical resolution and scale factor. Position is deliberately
 * excluded — rearranging displays must not invalidate the match — but it is
 * kept in the hint as a tie-breaker for identical monitors.
 */
export function fingerprintOf(display: {
  name: string | null;
  width: number;
  height: number;
  scaleFactor: number;
}): string {
  const name = display.name ?? '';
  return `${name}|${display.width}x${display.height}@${display.scaleFactor}`;
}

export function hintFor(display: DisplayInfo): DisplayHint {
  return {
    fingerprint: fingerprintOf(display),
    name: display.name,
    width: display.width,
    height: display.height,
    scaleFactor: display.scaleFactor,
    x: display.x,
    y: display.y,
  };
}

/**
 * Find the remembered display in the current topology.
 *
 * - Exactly one fingerprint match -> `exact`.
 * - Several matches (two identical TVs) -> disambiguate by position; still
 *   several -> `ambiguous`, and the caller must ask the operator.
 * - No match -> `none`.
 */
export function matchDisplay(
  hint: DisplayHint | null,
  displays: readonly DisplayInfo[],
): MatchResult {
  if (!hint) return { display: null, confidence: 'none' };

  const candidates = displays.filter((d) => fingerprintOf(d) === hint.fingerprint);
  if (candidates.length === 0) return { display: null, confidence: 'none' };
  if (candidates.length === 1)
    return { display: candidates[0] as DisplayInfo, confidence: 'exact' };

  const positional = candidates.filter((d) => d.x === hint.x && d.y === hint.y);
  if (positional.length === 1)
    return { display: positional[0] as DisplayInfo, confidence: 'exact' };

  // Two indistinguishable monitors. Guessing here is exactly the failure mode
  // Picta exists to avoid, so make the operator choose.
  return { display: null, confidence: 'ambiguous' };
}

/**
 * Deterministic display numbering for the current topology: left to right, then
 * top to bottom, then by name. Independent of the order the OS enumerates in,
 * so the number stays put while nothing is plugged or unplugged.
 */
export function orderDisplays<T extends Omit<DisplayInfo, 'index'>>(displays: readonly T[]): T[] {
  return displays.slice().sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    const an = a.name ?? '';
    const bn = b.name ?? '';
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** True when the two enumerations describe the same set of screens in the same places. */
export function topologyEquals(a: readonly DisplayInfo[], b: readonly DisplayInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as DisplayInfo;
    const y = b[i] as DisplayInfo;
    if (
      x.id !== y.id ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.width !== y.width ||
      x.height !== y.height ||
      x.scaleFactor !== y.scaleFactor
    ) {
      return false;
    }
  }
  return true;
}

/** `Samsung TV · 1920 × 1080` — the secondary line under a display name. */
export function describeDisplay(display: DisplayInfo): string {
  const parts: string[] = [];
  parts.push(display.name?.trim() || 'Display');
  parts.push(`${display.width} × ${display.height}`);
  if (display.scaleFactor !== 1) parts.push(`${Math.round(display.scaleFactor * 100)}%`);
  if (display.isPrimary) parts.push('Primary');
  return parts.join(' · ');
}

export function displayLabel(display: DisplayInfo): string {
  return `Display ${display.index}`;
}

export function findById(displays: readonly DisplayInfo[], id: string | null): DisplayInfo | null {
  if (id === null) return null;
  return displays.find((d) => d.id === id) ?? null;
}
