import { describe, expect, it } from 'vitest';
import {
  describeDisplay,
  fingerprintOf,
  hintFor,
  matchDisplay,
  orderDisplays,
  topologyEquals,
  type DisplayInfo,
} from '../src/core/monitors.js';

function display(over: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    id: 'x#0',
    index: 1,
    name: 'DELL P2422H',
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    scaleFactor: 1,
    isPrimary: false,
    ...over,
  };
}

describe('fingerprints', () => {
  it('ignores position so rearranging displays does not break the match', () => {
    const a = display({ x: 0 });
    const b = display({ x: -1920 });
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
  });

  it('distinguishes different resolutions, names and scales', () => {
    expect(fingerprintOf(display())).not.toBe(fingerprintOf(display({ width: 2560 })));
    expect(fingerprintOf(display())).not.toBe(fingerprintOf(display({ name: 'Samsung TV' })));
    expect(fingerprintOf(display())).not.toBe(fingerprintOf(display({ scaleFactor: 1.5 })));
  });
});

describe('matching a remembered display', () => {
  const tv = display({ id: 'tv#0', name: 'Samsung TV', x: 3840 });
  const dell = display({ id: 'dell#0', name: 'DELL P2422H', x: 1920 });
  const laptop = display({
    id: 'lap#0',
    name: 'Built-in Display',
    width: 2560,
    height: 1600,
    scaleFactor: 2,
  });

  it('finds a unique match', () => {
    const result = matchDisplay(hintFor(tv), [laptop, dell, tv]);
    expect(result.confidence).toBe('exact');
    expect(result.display?.id).toBe('tv#0');
  });

  it('still matches after the displays are rearranged', () => {
    const hint = hintFor(tv);
    const moved = { ...tv, x: -3840, y: 200 };
    const result = matchDisplay(hint, [laptop, dell, moved]);
    expect(result.confidence).toBe('exact');
    expect(result.display?.x).toBe(-3840);
  });

  it('reports none when the display is gone', () => {
    const result = matchDisplay(hintFor(tv), [laptop, dell]);
    expect(result.confidence).toBe('none');
    expect(result.display).toBeNull();
  });

  it('never guesses between two identical monitors', () => {
    const tvA = display({ id: 'tv#0', name: 'Samsung TV', x: 0 });
    const tvB = display({ id: 'tv#1', name: 'Samsung TV', x: 1920 });
    // Remembered at a position neither one now occupies.
    const hint = { ...hintFor(tvA), x: 5000, y: 5000 };
    const result = matchDisplay(hint, [tvA, tvB]);
    expect(result.confidence).toBe('ambiguous');
    expect(result.display).toBeNull();
  });

  it('disambiguates identical monitors by position when one still fits', () => {
    const tvA = display({ id: 'tv#0', name: 'Samsung TV', x: 0 });
    const tvB = display({ id: 'tv#1', name: 'Samsung TV', x: 1920 });
    const result = matchDisplay(hintFor(tvB), [tvA, tvB]);
    expect(result.confidence).toBe('exact');
    expect(result.display?.id).toBe('tv#1');
  });

  it('reports none without a hint', () => {
    expect(matchDisplay(null, [tv]).confidence).toBe('none');
  });

  it('does not fall back to another display when the index would still be valid', () => {
    // The classic failure: the TV was display 3, the TV is unplugged, and
    // something else is now third. A hint must never resolve to it.
    const scoreboard = display({ id: 'score#0', name: 'Scoreboard', x: 1920 });
    const result = matchDisplay(hintFor(tv), [laptop, scoreboard]);
    expect(result.display).toBeNull();
  });
});

describe('ordering', () => {
  it('numbers displays left to right, then top to bottom', () => {
    const ordered = orderDisplays([
      display({ id: 'c', x: 1920, y: 0, name: 'C' }),
      display({ id: 'a', x: -1920, y: 0, name: 'A' }),
      display({ id: 'b', x: 0, y: -1080, name: 'B' }),
    ]);
    expect(ordered.map((d) => d.name)).toEqual(['A', 'B', 'C']);
  });

  it('is independent of enumeration order', () => {
    const a = display({ id: 'a', x: 0, name: 'A' });
    const b = display({ id: 'b', x: 1920, name: 'B' });
    expect(orderDisplays([a, b])).toEqual(orderDisplays([b, a]));
  });
});

describe('topology comparison', () => {
  const a = display({ id: 'a' });
  const b = display({ id: 'b', x: 1920 });

  it('detects an unchanged topology', () => {
    expect(topologyEquals([a, b], [a, b])).toBe(true);
  });

  it('detects a disconnected display', () => {
    expect(topologyEquals([a, b], [a])).toBe(false);
  });

  it('detects a moved display', () => {
    expect(topologyEquals([a, b], [a, { ...b, x: -1920 }])).toBe(false);
  });

  it('detects a resolution change', () => {
    expect(topologyEquals([a], [{ ...a, width: 1280 }])).toBe(false);
  });

  it('detects a scale-factor change', () => {
    expect(topologyEquals([a], [{ ...a, scaleFactor: 1.5 }])).toBe(false);
  });
});

describe('descriptions', () => {
  it('reads like the display list in the mock-up', () => {
    expect(describeDisplay(display({ name: 'Samsung TV' }))).toBe('Samsung TV · 1920 × 1080');
  });

  it('mentions scaling and primary status when relevant', () => {
    const text = describeDisplay(
      display({
        name: 'Built-in Display',
        width: 2560,
        height: 1600,
        scaleFactor: 2,
        isPrimary: true,
      }),
    );
    expect(text).toBe('Built-in Display · 2560 × 1600 · 200% · Primary');
  });

  it('copes with an unnamed monitor', () => {
    expect(describeDisplay(display({ name: null }))).toBe('Display · 1920 × 1080');
  });
});
