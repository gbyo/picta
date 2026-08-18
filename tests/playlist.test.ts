import { describe, expect, it } from 'vitest';
import {
  firstPlayable,
  moveItem,
  playableIndexes,
  playablePosition,
  stepIndex,
} from '../src/core/playlist.js';

const items = (spec: string) =>
  spec.split('').map((c, i) => ({ path: `${i}.png`, missing: c === 'x' }));

describe('stepping through the show', () => {
  it('advances and wraps', () => {
    const list = items('ooo');
    expect(stepIndex(list, 0, 1)).toBe(1);
    expect(stepIndex(list, 2, 1)).toBe(0);
  });

  it('goes backwards and wraps', () => {
    const list = items('ooo');
    expect(stepIndex(list, 1, -1)).toBe(0);
    expect(stepIndex(list, 0, -1)).toBe(2);
  });

  it('starts at the first item from -1', () => {
    expect(stepIndex(items('ooo'), -1, 1)).toBe(0);
  });

  it('skips missing images', () => {
    const list = items('oxxo');
    expect(stepIndex(list, 0, 1)).toBe(3);
    expect(stepIndex(list, 3, 1)).toBe(0);
  });

  it('skips images that failed to decode', () => {
    const list = items('ooo');
    const skip = new Set(['1.png']);
    expect(stepIndex(list, 0, 1, skip)).toBe(2);
  });

  it('returns null when nothing is playable', () => {
    expect(stepIndex(items('xxx'), 0, 1)).toBeNull();
    expect(stepIndex(items('ooo'), 0, 1, new Set(['0.png', '1.png', '2.png']))).toBeNull();
    expect(stepIndex([], 0, 1)).toBeNull();
  });

  it('returns the only playable image repeatedly rather than stopping', () => {
    const list = items('xox');
    expect(stepIndex(list, 1, 1)).toBe(1);
    expect(stepIndex(list, 1, -1)).toBe(1);
  });

  it('recovers when the current index is out of range', () => {
    expect(stepIndex(items('ooo'), 99, 1)).toBe(0);
    expect(stepIndex(items('ooo'), 99, -1)).toBe(2);
  });
});

describe('first playable', () => {
  it('returns the requested index when it is playable', () => {
    expect(firstPlayable(items('ooo'), 0)).toBe(0);
  });

  it('moves past leading missing images', () => {
    expect(firstPlayable(items('xxo'), 0)).toBe(2);
  });

  it('returns null for an empty or fully missing list', () => {
    expect(firstPlayable([], 0)).toBeNull();
    expect(firstPlayable(items('xx'), 0)).toBeNull();
  });
});

describe('position reporting', () => {
  it('counts only playable images', () => {
    const list = items('oxoo');
    expect(playableIndexes(list, new Set())).toEqual([0, 2, 3]);
    expect(playablePosition(list, 2)).toEqual({ position: 2, total: 3 });
    expect(playablePosition(list, 3)).toEqual({ position: 3, total: 3 });
  });

  it('does not go negative before the first image appears', () => {
    expect(playablePosition(items('oo'), -1)).toEqual({ position: 0, total: 2 });
  });
});

describe('reordering', () => {
  it('moves an item forwards and backwards', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op when the position does not change', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('clamps out-of-range targets and ignores bad sources', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 9, 0)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    moveItem(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
