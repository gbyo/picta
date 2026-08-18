/**
 * Playback ordering.
 *
 * The visual order of the thumbnails is the playback order. Images that are
 * missing on disk, or that failed to decode, are skipped rather than shown as
 * an error — nothing but images ever reaches the presentation display.
 */

export interface PlayableItem {
  readonly path: string;
  readonly missing: boolean;
}

export function playableIndexes(
  items: readonly PlayableItem[],
  skip: ReadonlySet<string>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as PlayableItem;
    if (!item.missing && !skip.has(item.path)) out.push(i);
  }
  return out;
}

/**
 * Next playable index after `current`, wrapping around. Returns `null` when
 * nothing is playable.
 *
 * `current` may be -1 (nothing shown yet) or point at an item that has since
 * become unplayable; both are handled.
 */
export function stepIndex(
  items: readonly PlayableItem[],
  current: number,
  direction: 1 | -1,
  skip: ReadonlySet<string> = new Set(),
): number | null {
  const count = items.length;
  if (count === 0) return null;
  const start = current < 0 || current >= count ? (direction === 1 ? -1 : 0) : current;
  for (let step = 1; step <= count; step += 1) {
    const index = (((start + direction * step) % count) + count) % count;
    const item = items[index] as PlayableItem;
    if (!item.missing && !skip.has(item.path)) return index;
  }
  return null;
}

/** First playable index at or after `from`, wrapping. */
export function firstPlayable(
  items: readonly PlayableItem[],
  from = 0,
  skip: ReadonlySet<string> = new Set(),
): number | null {
  if (items.length === 0) return null;
  const startItem = items[from];
  if (startItem !== undefined && !startItem.missing && !skip.has(startItem.path)) return from;
  return stepIndex(items, from, 1, skip);
}

/** Human-readable position, counting only playable items. */
export function playablePosition(
  items: readonly PlayableItem[],
  index: number,
  skip: ReadonlySet<string> = new Set(),
): { position: number; total: number } {
  const playable = playableIndexes(items, skip);
  const position = playable.indexOf(index);
  return { position: position < 0 ? 0 : position + 1, total: playable.length };
}

/** Move an item within the list, returning a new array. Used by drag-reorder. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from < 0 || from >= next.length) return next;
  const clampedTo = Math.max(0, Math.min(next.length - 1, to));
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(clampedTo, 0, moved);
  return next;
}
