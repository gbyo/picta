/**
 * Relinking images that moved.
 *
 * When several images went missing together, they usually moved together.
 * Picking one folder should therefore fix all of them, rather than asking the
 * operator to answer ten file dialogs.
 *
 * The candidate generation here is pure; the caller decides which candidate
 * actually exists on disk.
 */

import { basename, pathSuffixes, resolvePath, type PathStyle } from './paths.js';

/**
 * Candidate replacement paths for `missingPath` inside `folder`, ordered from
 * most specific to least.
 *
 * For `E:/Old/Images/logos/bank.png` searched in `F:/New` this yields
 * `F:/New/Images/logos/bank.png`, `F:/New/logos/bank.png`, `F:/New/bank.png`.
 * The longest match wins so that two files with the same name in different
 * subfolders do not collapse onto each other.
 */
export function relinkCandidates(missingPath: string, folder: string, style: PathStyle): string[] {
  const suffixes = pathSuffixes(missingPath, style);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const suffix of suffixes) {
    const candidate = resolvePath(folder, suffix, style);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

export interface RelinkPlan {
  /** Index into the caller's image list. */
  index: number;
  from: string;
  candidates: string[];
}

/** Build the candidate lists for every missing entry against one chosen folder. */
export function planRelink(
  missing: readonly { index: number; path: string }[],
  folder: string,
  style: PathStyle,
): RelinkPlan[] {
  return missing.map((entry) => ({
    index: entry.index,
    from: entry.path,
    candidates: relinkCandidates(entry.path, folder, style),
  }));
}

/**
 * Given an existence oracle, pick the first candidate that exists for each
 * entry. Returns only the entries that were successfully relinked.
 */
export function applyRelink(
  plans: readonly RelinkPlan[],
  exists: (path: string) => boolean,
): { index: number; path: string }[] {
  const resolved: { index: number; path: string }[] = [];
  for (const plan of plans) {
    const hit = plan.candidates.find((candidate) => exists(candidate));
    if (hit !== undefined) resolved.push({ index: plan.index, path: hit });
  }
  return resolved;
}

/**
 * A folder is a plausible relink target when it contains at least one of the
 * missing file names. Used only to phrase the result ("relinked 8 of 10").
 */
export function missingFileNames(missing: readonly { path: string }[], style: PathStyle): string[] {
  return missing.map((entry) => basename(entry.path, style));
}
