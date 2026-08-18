import { describe, expect, it } from 'vitest';
import {
  PICTA_FORMAT_VERSION,
  parsePicta,
  resolveParsedPaths,
  serializePicta,
} from '../src/core/picta-file.js';

const valid = {
  version: 1,
  images: [{ path: 'Images/acme.png' }, { path: 'Images/bank.jpg' }],
  intervalSeconds: 10,
  transition: 'crossfade',
  imageSizing: 'fit',
};

function parse(value: unknown) {
  return parsePicta(JSON.stringify(value));
}

describe('parsing a valid document', () => {
  it('reads every documented field', () => {
    const result = parse(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(1);
    expect(result.value.storedPaths).toEqual(['Images/acme.png', 'Images/bank.jpg']);
    expect(result.value.intervalSeconds).toBe(10);
    expect(result.value.transition).toBe('crossfade');
    expect(result.value.imageSizing).toBe('fit');
  });

  it('preserves image order exactly', () => {
    const result = parse({
      ...valid,
      images: [{ path: 'c.png' }, { path: 'a.png' }, { path: 'b.png' }],
    });
    expect(result.ok && result.value.storedPaths).toEqual(['c.png', 'a.png', 'b.png']);
  });

  it('applies defaults for omitted optional fields', () => {
    const result = parse({ version: 1, images: [{ path: 'a.png' }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intervalSeconds).toBe(10);
    expect(result.value.transition).toBe('crossfade');
    expect(result.value.imageSizing).toBe('fit');
  });

  it('ignores unknown optional fields', () => {
    const result = parse({ ...valid, notes: 'hello', futureThing: { a: 1 } });
    expect(result.ok).toBe(true);
  });

  it('accepts an empty image list', () => {
    const result = parse({ version: 1, images: [] });
    expect(result.ok && result.value.storedPaths).toEqual([]);
  });
});

describe('version handling', () => {
  it('rejects a newer format version with a clear message', () => {
    const result = parse({ ...valid, version: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('unsupported-version');
    expect(result.message).toContain('version 2');
    expect(result.message).toContain('Update Picta');
  });

  it('rejects a missing version', () => {
    const result = parse({ images: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('missing-version');
  });

  it('rejects a non-integer version', () => {
    expect(parse({ version: 1.5, images: [] }).ok).toBe(false);
    expect(parse({ version: '1', images: [] }).ok).toBe(false);
    expect(parse({ version: 0, images: [] }).ok).toBe(false);
  });
});

describe('malformed documents never throw', () => {
  const cases: [string, string][] = [
    ['not JSON at all', 'this is not json'],
    ['truncated JSON', '{"version": 1, "images": ['],
    ['a bare array', '[]'],
    ['a bare string', '"picta"'],
    ['null', 'null'],
    ['a number', '42'],
    ['empty', ''],
  ];

  for (const [label, text] of cases) {
    it(`rejects ${label}`, () => {
      const result = parsePicta(text);
      expect(result.ok).toBe(false);
    });
  }

  it('rejects invalid image entries', () => {
    expect(parse({ version: 1, images: 'Images/a.png' }).ok).toBe(false);
    expect(parse({ version: 1, images: ['Images/a.png'] }).ok).toBe(false);
    expect(parse({ version: 1, images: [{}] }).ok).toBe(false);
    expect(parse({ version: 1, images: [{ path: 42 }] }).ok).toBe(false);
    expect(parse({ version: 1, images: [{ path: '  ' }] }).ok).toBe(false);
    expect(parse({ version: 1, images: [null] }).ok).toBe(false);
  });

  it('reports which entry was wrong', () => {
    const result = parse({ version: 1, images: [{ path: 'a.png' }, { path: 5 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('entry 2');
  });

  it('rejects invalid scalar fields rather than silently resetting them', () => {
    expect(parse({ ...valid, intervalSeconds: 0 }).ok).toBe(false);
    expect(parse({ ...valid, intervalSeconds: -5 }).ok).toBe(false);
    expect(parse({ ...valid, intervalSeconds: 'ten' }).ok).toBe(false);
    expect(parse({ ...valid, intervalSeconds: Number.NaN }).ok).toBe(false);
    expect(parse({ ...valid, intervalSeconds: 999999 }).ok).toBe(false);
    expect(parse({ ...valid, transition: 'wipe' }).ok).toBe(false);
    expect(parse({ ...valid, imageSizing: 'stretch' }).ok).toBe(false);
  });

  it('treats a document as data, never as instructions', () => {
    // Paths are only ever resolved and used to load images. Nothing here can
    // change what Picta is allowed to touch.
    const result = parse({
      version: 1,
      images: [{ path: 'Images/a.png' }],
      allowedPaths: ['/'],
      command: 'rm -rf /',
      __proto__: { polluted: true },
    });
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('serialisation', () => {
  const doc = {
    images: [{ path: 'E:\\Basketball\\Images\\bank.png' }, { path: 'C:\\Other\\far.png' }],
    intervalSeconds: 15,
    transition: 'none' as const,
    imageSizing: 'fill' as const,
  };

  it('writes relative paths where possible and absolute otherwise', () => {
    const text = serializePicta(doc, 'E:\\Basketball\\Basketball.picta', 'win32');
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({
      version: PICTA_FORMAT_VERSION,
      images: [{ path: 'Images/bank.png' }, { path: 'C:/Other/far.png' }],
      intervalSeconds: 15,
      transition: 'none',
      imageSizing: 'fill',
    });
  });

  it('produces human-readable text ending in a newline', () => {
    const text = serializePicta(doc, 'E:\\B\\B.picta', 'win32');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "version": 1');
  });

  it('round-trips through parse and resolve', () => {
    const file = '/shows/lobby/Lobby.picta';
    const text = serializePicta(
      {
        images: [{ path: '/shows/lobby/Images/a.png' }, { path: '/shows/lobby/Images/b.png' }],
        intervalSeconds: 30,
        transition: 'crossfade',
        imageSizing: 'fit',
      },
      file,
      'posix',
    );
    const parsed = parsePicta(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(resolveParsedPaths(parsed.value, file, 'posix')).toEqual([
      '/shows/lobby/Images/a.png',
      '/shows/lobby/Images/b.png',
    ]);
    expect(parsed.value.intervalSeconds).toBe(30);
  });

  it('keeps a show working after the whole folder moves to a USB stick', () => {
    const text = serializePicta(
      {
        images: [{ path: 'E:\\Basketball\\Images\\bank.png' }],
        intervalSeconds: 10,
        transition: 'crossfade',
        imageSizing: 'fit',
      },
      'E:\\Basketball\\Basketball.picta',
      'win32',
    );
    const parsed = parsePicta(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(resolveParsedPaths(parsed.value, 'D:\\Basketball\\Basketball.picta', 'win32')).toEqual([
      'D:\\Basketball\\Images\\bank.png',
    ]);
  });
});
