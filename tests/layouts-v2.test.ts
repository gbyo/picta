import { describe, expect, it } from 'vitest';
import {
  BOARD_TWO_THIRDS_LAYOUT,
  HALF_HALF_LAYOUT,
  PROGRAM_TWO_THIRDS_LAYOUT,
  resolveZoneRects,
  updateSplitRatioAtPath,
  validateLayout,
} from '../src/core/layouts.js';

describe('recursive output layouts', () => {
  it('resolves the 3840x1080 half-and-half preset exactly', () => {
    expect(resolveZoneRects(HALF_HALF_LAYOUT, 3840, 1080)).toEqual([
      { id: 'program', role: 'program', x: 0, y: 0, width: 1920, height: 1080 },
      { id: 'live-board', role: 'live-board', x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
  });

  it('resolves two-thirds without losing a pixel', () => {
    const rects = resolveZoneRects(PROGRAM_TWO_THIRDS_LAYOUT, 3840, 1080);
    expect(rects.map((rect) => rect.width)).toEqual([2560, 1280]);
    expect(rects[0]?.x).toBe(0);
    expect(rects[1]?.x).toBe(2560);
    expect((rects[0]?.width ?? 0) + (rects[1]?.width ?? 0)).toBe(3840);
  });

  it('handles rows, nesting and odd dimensions with adjacent edges', () => {
    const layout = {
      type: 'split' as const,
      direction: 'rows' as const,
      ratio: 0.5,
      first: HALF_HALF_LAYOUT,
      second: BOARD_TWO_THIRDS_LAYOUT,
    };
    const rects = resolveZoneRects(layout, 101, 101);
    expect(rects).toHaveLength(4);
    expect(rects.slice(0, 2).every((rect) => rect.y === 0)).toBe(true);
    expect(rects[2]?.y).toBe(51);
    expect(rects[0]?.width).toBe(51);
    expect((rects[0]?.width ?? 0) + (rects[1]?.width ?? 0)).toBe(101);
    expect((rects[2]?.width ?? 0) + (rects[3]?.width ?? 0)).toBe(101);
  });

  it('requires exactly one program and rejects duplicates or invalid ratios', () => {
    const missingProgram = validateLayout({ type: 'zone', id: 'a', role: 'live-board' });
    expect(missingProgram.ok ? null : missingProgram.kind).toBe('program-zone-count');
    const duplicate = validateLayout({
      type: 'split',
      direction: 'columns',
      ratio: 0.5,
      first: { type: 'zone', id: 'program', role: 'program' },
      second: { type: 'zone', id: 'program', role: 'blank' },
    });
    expect(duplicate.ok ? null : duplicate.kind).toBe('duplicate-zone-id');
    const badRatio = validateLayout({
      type: 'split',
      direction: 'columns',
      ratio: 0.01,
      first: { type: 'zone', id: 'program', role: 'program' },
      second: { type: 'zone', id: 'blank', role: 'blank' },
    });
    expect(badRatio.ok ? null : badRatio.kind).toBe('invalid-ratio');
  });

  it('updates a nested divider by path without changing zone roles', () => {
    const next = updateSplitRatioAtPath(
      {
        type: 'split',
        direction: 'columns',
        ratio: 0.5,
        first: { type: 'zone', id: 'program', role: 'program' },
        second: {
          type: 'split',
          direction: 'rows',
          ratio: 0.5,
          first: { type: 'zone', id: 'board', role: 'live-board' },
          second: { type: 'zone', id: 'blank', role: 'blank' },
        },
      },
      ['second'],
      0.7,
    );
    expect(next.type).toBe('split');
    if (
      next.type === 'split' &&
      next.second.type === 'split' &&
      next.second.first.type === 'zone'
    ) {
      expect(next.second.ratio).toBe(0.7);
      expect(next.second.first.role).toBe('live-board');
    }
  });
});
