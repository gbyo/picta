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

describe('the optional roster', () => {
  it('is absent from an ordinary image show, keeping the file as small as before', () => {
    const text = serializePicta(
      {
        images: [{ path: '/s/Images/a.png' }],
        intervalSeconds: 10,
        transition: 'crossfade',
        imageSizing: 'fit',
        roster: [],
      },
      '/s/S.picta',
      'posix',
    );
    expect(JSON.parse(text)).not.toHaveProperty('roster');
  });

  it('opens files written before rosters existed', () => {
    const result = parse(valid);
    expect(result.ok && result.value.roster).toEqual([]);
  });

  it('reads players, positions and counters', () => {
    const result = parse({
      ...valid,
      roster: [
        { number: '7', name: 'Avery Chen', position: 'OH', stats: { kills: 12, digs: 6 } },
        { number: '3', name: 'Jordan Ruiz', position: 'S' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roster).toHaveLength(2);
    expect(result.value.roster[0]?.name).toBe('Avery Chen');
    expect(result.value.roster[0]?.stats.kills).toBe(12);
    expect(result.value.roster[0]?.stats.digs).toBe(6);
    // Omitted counters read as zero, not as missing.
    expect(result.value.roster[0]?.stats.aces).toBe(0);
    expect(result.value.roster[1]?.stats.kills).toBe(0);
  });

  it('accepts a jersey number written as a JSON number', () => {
    const result = parse({ ...valid, roster: [{ number: 7, name: 'Avery' }] });
    expect(result.ok && result.value.roster[0]?.number).toBe('7');
  });

  it('gives every loaded player a distinct id', () => {
    const result = parse({
      ...valid,
      roster: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.value.roster.map((p) => p.id)).size).toBe(3);
  });

  it('preserves roster order', () => {
    const result = parse({
      ...valid,
      roster: [{ name: 'C' }, { name: 'A' }, { name: 'B' }],
    });
    expect(result.ok && result.value.roster.map((p) => p.name)).toEqual(['C', 'A', 'B']);
  });

  it('rejects a malformed roster rather than dropping players silently', () => {
    expect(parse({ ...valid, roster: 'Avery' }).ok).toBe(false);
    expect(parse({ ...valid, roster: [{ number: '7' }] }).ok).toBe(false);
    expect(parse({ ...valid, roster: [{ name: '   ' }] }).ok).toBe(false);
    expect(parse({ ...valid, roster: [null] }).ok).toBe(false);
    expect(parse({ ...valid, roster: [{ name: 'A', position: 5 }] }).ok).toBe(false);
  });

  it('rejects impossible counters', () => {
    expect(parse({ ...valid, roster: [{ name: 'A', stats: { kills: -1 } }] }).ok).toBe(false);
    expect(parse({ ...valid, roster: [{ name: 'A', stats: { kills: 1.5 } }] }).ok).toBe(false);
    expect(parse({ ...valid, roster: [{ name: 'A', stats: { kills: 'lots' } }] }).ok).toBe(false);
    expect(parse({ ...valid, roster: [{ name: 'A', stats: 5 }] }).ok).toBe(false);
  });

  it('names the offending player', () => {
    const result = parse({
      ...valid,
      roster: [{ name: 'A' }, { name: 'B', stats: { digs: -3 } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Player 2');
  });

  it('round-trips a roster, omitting zero counters', () => {
    const text = serializePicta(
      {
        images: [],
        intervalSeconds: 10,
        transition: 'crossfade',
        imageSizing: 'fit',
        roster: [
          {
            id: 'runtime-only',
            number: '7',
            name: 'Avery Chen',
            position: 'OH',
            stats: {
              kills: 12,
              attackErrors: 2,
              attempts: 30,
              assists: 0,
              aces: 1,
              serviceErrors: 0,
              digs: 6,
              blockSolos: 0,
              blockAssists: 3,
            },
          },
        ],
      },
      '/s/S.picta',
      'posix',
    );
    const written = JSON.parse(text);
    // Ids are runtime-only and zero counters are left out.
    expect(written.roster[0]).toEqual({
      number: '7',
      name: 'Avery Chen',
      position: 'OH',
      stats: { kills: 12, attackErrors: 2, attempts: 30, aces: 1, digs: 6, blockAssists: 3 },
    });

    const back = parsePicta(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const player = back.value.roster[0]!;
    expect(player.name).toBe('Avery Chen');
    expect(player.stats.kills).toBe(12);
    expect(player.stats.assists).toBe(0);
    expect(player.stats.blockAssists).toBe(3);
  });
});
