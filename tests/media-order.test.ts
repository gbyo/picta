/**
 * moveMediaItem backs the drag-and-drop reordering of the media list, where a
 * wrong index silently reorders someone's show.
 */

import { describe, expect, it } from 'vitest';
import { moveMediaItem } from '../src/core/media.js';
import type { MediaItem } from '../src/core/domain.js';

const items = (spec: string): MediaItem[] =>
  spec.split('').map((id) => ({ id, path: `${id}.png`, type: 'image' }) as MediaItem);

const order = (list: readonly MediaItem[]): string => list.map((item) => item.id).join('');

describe('reordering media', () => {
  it('moves an item down to the index it was dropped on', () => {
    expect(order(moveMediaItem(items('abcd'), 0, 2))).toBe('bcad');
  });

  it('moves an item up to the index it was dropped on', () => {
    expect(order(moveMediaItem(items('abcd'), 2, 0))).toBe('cabd');
  });

  it('moves an item to the end and to the front', () => {
    expect(order(moveMediaItem(items('abcd'), 0, 3))).toBe('bcda');
    expect(order(moveMediaItem(items('abcd'), 3, 0))).toBe('dabc');
  });

  it('leaves the order alone when an item is dropped on itself', () => {
    expect(order(moveMediaItem(items('abcd'), 2, 2))).toBe('abcd');
  });

  it('clamps a destination past either end instead of dropping the item', () => {
    expect(order(moveMediaItem(items('abcd'), 1, 99))).toBe('acdb');
    expect(order(moveMediaItem(items('abcd'), 1, -4))).toBe('bacd');
  });

  it('ignores a source index that is not in the list', () => {
    expect(order(moveMediaItem(items('abcd'), -1, 2))).toBe('abcd');
    expect(order(moveMediaItem(items('abcd'), 9, 2))).toBe('abcd');
  });

  it('never mutates the list it was given', () => {
    const original = items('abcd');
    moveMediaItem(original, 0, 3);
    expect(order(original)).toBe('abcd');
  });

  it('keeps every item exactly once', () => {
    const moved = moveMediaItem(items('abcde'), 3, 1);
    expect(order(moved)).toBe('adbce');
    expect(moved).toHaveLength(5);
  });
});
