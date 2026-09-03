import { describe, expect, it } from 'vitest';
import {
  defaultShowDocument,
  parsePictaV2,
  parsePictaV3,
  serializePictaV3,
} from '../src/core/show-file.js';
import { FULL_LAYOUT } from '../src/core/layouts.js';
import { defaultMediaSet } from '../src/core/media.js';

describe('picta v3', () => {
  it('round-trips v3 and writes only Screens', () => {
    const source = defaultShowDocument();
    const text = serializePictaV3(source, '/shows/game.picta', 'posix');
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body['version']).toBe(3);
    expect(body['screens']).toBeDefined();
    expect(body['scenes']).toBeUndefined();
    const parsed = parsePictaV3(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.screens).toEqual(source.screens);
  });

  it('migrates a common v2 layout and adds safe score state', () => {
    const parsed = parsePictaV2(
      JSON.stringify({
        version: 2,
        media: { kind: 'inline', data: defaultMediaSet('Inline') },
        event: { stats: {}, liveGroups: {} },
        scenes: [{ id: 'old', name: 'Old', layout: FULL_LAYOUT, background: { kind: 'black' } }],
        defaultSceneId: 'old',
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.version).toBe(3);
    expect(parsed.value.screens[0]?.panels[0]?.content.kind).toBe('media');
    expect(parsed.value.event.score).toMatchObject({ homePoints: 0, awayPoints: 0, setNumber: 1 });
  });

  it('preserves custom four-panel geometry during v2 migration', () => {
    const zone = (id: string, role: 'program' | 'blank' = 'blank') => ({
      type: 'zone' as const,
      id,
      role,
    });
    const layout = {
      type: 'split' as const,
      direction: 'columns' as const,
      ratio: 0.5,
      first: {
        type: 'split' as const,
        direction: 'rows' as const,
        ratio: 0.4,
        first: zone('a', 'program'),
        second: zone('b'),
      },
      second: {
        type: 'split' as const,
        direction: 'rows' as const,
        ratio: 0.7,
        first: zone('c'),
        second: zone('d'),
      },
    };
    const parsed = parsePictaV2(
      JSON.stringify({
        version: 2,
        media: { kind: 'inline', data: defaultMediaSet('Inline') },
        event: { stats: { p1: { kills: 2 } }, liveGroups: { court: ['p1'] } },
        scenes: [{ id: 'custom', name: 'Custom', layout, background: { kind: 'black' } }],
        defaultSceneId: 'custom',
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.screens[0]?.panels.map((panel) => panel.rect)).toEqual([
      { x: 0, y: 0, width: 0.5, height: 0.4 },
      { x: 0, y: 0.4, width: 0.5, height: 0.6 },
      { x: 0.5, y: 0, width: 0.5, height: 0.7 },
      { x: 0.5, y: 0.7, width: 0.5, height: 0.30000000000000004 },
    ]);
    expect(parsed.value.event.stats.p1?.kills).toBe(2);
  });
});
