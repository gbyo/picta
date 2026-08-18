import { describe, expect, it } from 'vitest';
import {
  appendImages,
  countMissing,
  documentTitle,
  makeImageItem,
  missingImages,
  newDocument,
  windowTitle,
} from '../src/core/document.js';
import { isSupportedImagePath, isValidInterval } from '../src/core/types.js';
import { parsePrefs } from '../src/app/prefs.js';

describe('a new document', () => {
  it('starts empty, clean and on the documented defaults', () => {
    const doc = newDocument();
    expect(doc.filePath).toBeNull();
    expect(doc.dirty).toBe(false);
    expect(doc.data.images).toEqual([]);
    expect(doc.data.intervalSeconds).toBe(10);
    expect(doc.data.transition).toBe('crossfade');
    expect(doc.data.imageSizing).toBe('fit');
  });
});

describe('titles', () => {
  it('uses the file name without its extension', () => {
    const doc = { ...newDocument(), filePath: 'E:\\Shows\\Football Ads.picta' };
    expect(documentTitle(doc)).toBe('Football Ads');
    expect(windowTitle(doc)).toBe('Football Ads — Picta');
  });

  it('marks unsaved changes', () => {
    const doc = { ...newDocument(), filePath: '/s/Lobby.picta', dirty: true };
    expect(windowTitle(doc)).toBe('• Lobby — Picta');
  });

  it('calls an unsaved document Untitled', () => {
    expect(documentTitle(newDocument())).toBe('Untitled');
  });
});

describe('adding images', () => {
  it('appends in the order given', () => {
    const result = appendImages([], ['a.png', 'b.png']);
    expect(result.map((i) => i.path)).toEqual(['a.png', 'b.png']);
  });

  it('ignores duplicates', () => {
    const first = appendImages([], ['a.png', 'b.png']);
    const second = appendImages(first, ['b.png', 'c.png']);
    expect(second.map((i) => i.path)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('does not mutate the input list', () => {
    const original = appendImages([], ['a.png']);
    appendImages(original, ['b.png']);
    expect(original).toHaveLength(1);
  });
});

describe('missing images', () => {
  const images = [
    makeImageItem('a.png'),
    makeImageItem('b.png', true),
    makeImageItem('c.png'),
    makeImageItem('d.png', true),
  ];

  it('reports which entries and how many', () => {
    expect(countMissing(images)).toBe(2);
    expect(missingImages(images)).toEqual([
      { index: 1, path: 'b.png' },
      { index: 3, path: 'd.png' },
    ]);
  });
});

describe('supported image types', () => {
  it('accepts exactly PNG, JPEG and WebP', () => {
    for (const good of ['a.png', 'a.PNG', 'a.jpg', 'a.jpeg', 'a.JPEG', 'a.webp']) {
      expect(isSupportedImagePath(good)).toBe(true);
    }
    for (const bad of ['a.gif', 'a.bmp', 'a.svg', 'a.mp4', 'a.pdf', 'a.pptx', 'a.html', 'a']) {
      expect(isSupportedImagePath(bad)).toBe(false);
    }
  });
});

describe('interval validation', () => {
  it('rejects zero, negatives and nonsense', () => {
    expect(isValidInterval(10)).toBe(true);
    expect(isValidInterval(1)).toBe(true);
    expect(isValidInterval(0)).toBe(false);
    expect(isValidInterval(-1)).toBe(false);
    expect(isValidInterval(Number.NaN)).toBe(false);
    expect(isValidInterval(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidInterval('10')).toBe(false);
    expect(isValidInterval(null)).toBe(false);
  });
});

describe('preferences parsing', () => {
  it('degrades to defaults on a corrupt file', () => {
    for (const junk of [null, 'nonsense', 42, [], { displayHint: 'x' }]) {
      const prefs = parsePrefs(junk);
      expect(prefs.displayHint).toBeNull();
      expect(prefs.window).toBeNull();
    }
  });

  it('reads a complete file', () => {
    const prefs = parsePrefs({
      displayHint: {
        fingerprint: 'Samsung TV|1920x1080@1',
        name: 'Samsung TV',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        x: 3840,
        y: 0,
      },
      lastDirectory: '/shows',
      window: { width: 460, height: 780, x: 100, y: 80 },
    });
    expect(prefs.displayHint?.name).toBe('Samsung TV');
    expect(prefs.lastDirectory).toBe('/shows');
    expect(prefs.window?.width).toBe(460);
  });

  it('rejects a partially valid hint rather than half-trusting it', () => {
    const prefs = parsePrefs({
      displayHint: { fingerprint: 'x', width: 1920, height: 'tall', scaleFactor: 1, x: 0, y: 0 },
    });
    expect(prefs.displayHint).toBeNull();
  });

  it('rejects an absurd window size', () => {
    expect(parsePrefs({ window: { width: 1, height: 1, x: 0, y: 0 } }).window).toBeNull();
  });
});
