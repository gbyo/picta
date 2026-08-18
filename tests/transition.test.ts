import { describe, expect, it } from 'vitest';
import { DoubleBuffer, otherLayer } from '../src/core/transition.js';

describe('double buffering', () => {
  it('loads into the hidden layer, never the visible one', () => {
    const buffer = new DoubleBuffer();
    expect(buffer.visibleLayer).toBe('a');
    const request = buffer.request('1.png', 0);
    expect(request.layer).toBe('b');
    expect(buffer.visibleLayer).toBe('a');
  });

  it('only swaps once the image has decoded', () => {
    const buffer = new DoubleBuffer();
    const request = buffer.request('1.png', 0);
    // Nothing is on screen yet: the request alone changes nothing.
    expect(buffer.shownIndex).toBe(-1);
    const outcome = buffer.decoded(request.token);
    expect(outcome.kind).toBe('swap');
    expect(buffer.visibleLayer).toBe('b');
    expect(buffer.shownIndex).toBe(0);
    expect(buffer.shownPath).toBe('1.png');
  });

  it('reports which layer can be released after the swap', () => {
    const buffer = new DoubleBuffer();
    const first = buffer.request('1.png', 0);
    buffer.decoded(first.token);
    const second = buffer.request('2.png', 1);
    const outcome = buffer.decoded(second.token);
    expect(outcome.kind === 'swap' && outcome.retired).toBe('b');
  });

  it('alternates layers across many transitions', () => {
    const buffer = new DoubleBuffer();
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) {
      const request = buffer.request(`${i}.png`, i);
      seen.add(request.layer);
      expect(request.layer).toBe(otherLayer(buffer.visibleLayer));
      buffer.decoded(request.token);
    }
    expect([...seen].sort()).toEqual(['a', 'b']);
    expect(buffer.shownIndex).toBe(1_999);
  });

  it('keeps the current image when a decode fails', () => {
    const buffer = new DoubleBuffer();
    const first = buffer.request('1.png', 0);
    buffer.decoded(first.token);

    const second = buffer.request('broken.png', 1);
    const outcome = buffer.failed(second.token);
    expect(outcome.kind).toBe('failed');
    expect(buffer.visibleLayer).toBe('b');
    expect(buffer.shownPath).toBe('1.png');
    expect(buffer.shownIndex).toBe(0);
  });

  it('ignores a superseded request, so a burst of Next cannot leave a stale image', () => {
    const buffer = new DoubleBuffer();
    const stale = buffer.request('1.png', 0);
    const fresh = buffer.request('2.png', 1);

    expect(buffer.decoded(stale.token).kind).toBe('ignored');
    expect(buffer.shownIndex).toBe(-1);

    expect(buffer.decoded(fresh.token).kind).toBe('swap');
    expect(buffer.shownPath).toBe('2.png');
  });

  it('ignores a late failure from a superseded request', () => {
    const buffer = new DoubleBuffer();
    const stale = buffer.request('1.png', 0);
    const fresh = buffer.request('2.png', 1);
    buffer.decoded(fresh.token);
    expect(buffer.failed(stale.token).kind).toBe('ignored');
    expect(buffer.shownPath).toBe('2.png');
  });

  it('ignores results that arrive with nothing pending', () => {
    const buffer = new DoubleBuffer();
    expect(buffer.decoded(1).kind).toBe('ignored');
    expect(buffer.failed(1).kind).toBe('ignored');
  });

  it('abandons an in-flight load without disturbing the screen', () => {
    const buffer = new DoubleBuffer();
    const first = buffer.request('1.png', 0);
    buffer.decoded(first.token);
    const second = buffer.request('2.png', 1);
    buffer.abandon();
    expect(buffer.pending).toBeNull();
    expect(buffer.decoded(second.token).kind).toBe('ignored');
    expect(buffer.shownPath).toBe('1.png');
  });

  it('resets to a blank first layer for a new show', () => {
    const buffer = new DoubleBuffer();
    const request = buffer.request('1.png', 0);
    buffer.decoded(request.token);
    buffer.reset();
    expect(buffer.visibleLayer).toBe('a');
    expect(buffer.shownIndex).toBe(-1);
    expect(buffer.shownPath).toBeNull();
    expect(buffer.pending).toBeNull();
  });

  it('behaves identically for the direct transition — the swap still waits for decode', () => {
    // The state machine carries no notion of fade duration on purpose: `none`
    // means no crossfade, not "show it before it is ready".
    const buffer = new DoubleBuffer();
    const request = buffer.request('1.png', 0);
    expect(buffer.shownIndex).toBe(-1);
    buffer.decoded(request.token);
    expect(buffer.shownIndex).toBe(0);
  });
});
