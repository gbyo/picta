import { describe, expect, it } from 'vitest';
import { defaultMediaSet, makeMediaItem } from '../src/core/media.js';
import {
  parseMediaSet,
  resolveMediaSetPaths,
  serializeMediaSet,
} from '../src/core/media-set-file.js';
import { HALF_HALF_LAYOUT } from '../src/core/layouts.js';
import { migratePictaV1, parsePictaV2, serializePictaV2 } from '../src/core/show-file.js';
import { parseTeam, resolveTeamPaths, serializeTeam } from '../src/core/team-file.js';
import { addPlayer, createTeam, makePlayer, setGroupPlayers } from '../src/core/teams.js';

describe('pictateam and pictaset formats', () => {
  it('persists stable player and group ids while omitting live stats', () => {
    const player = makePlayer('7', 'Avery', 'OH', 'player-fixed');
    const team = setGroupPlayers(
      addPlayer(createTeam('Wildcats', 'volleyball'), player),
      'starting-lineup',
      [player.id],
    );
    const withPlayer = team;
    const text = serializeTeam(withPlayer, '/shows/team/Wildcats.pictateam', 'posix');
    const parsed = parseTeam(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.players[0]?.id).toBe('player-fixed');
    expect(parsed.value.groups[0]?.playerIds).toEqual(['player-fixed']);
    expect(text).not.toContain('stats');
  });

  it('round-trips relative player media paths', () => {
    const player = {
      ...makePlayer('7', 'Avery', 'OH', 'player-fixed'),
      media: {
        photo: { path: '/shows/team/Players/avery.png' },
        introVideo: { path: '/shows/team/Players/avery.mp4' },
      },
    };
    const team = { ...createTeam('Wildcats', 'volleyball'), players: [player] };
    const parsed = parseTeam(serializeTeam(team, '/shows/team/Wildcats.pictateam', 'posix'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolveTeamPaths(parsed.value, '/shows/team/Wildcats.pictateam', 'posix');
    expect(resolved.players[0]?.media.photo?.path).toBe('/shows/team/Players/avery.png');
    expect(resolved.players[0]?.media.introVideo?.path).toBe('/shows/team/Players/avery.mp4');
  });

  it('validates media type and preserves order and duration', () => {
    const set = defaultMediaSet('Sponsors');
    const image = makeMediaItem('/shows/bank.png', 'image-1');
    const video = makeMediaItem('/shows/ford.mp4', 'video-1');
    expect(image && video).toBeTruthy();
    set.items = [image!, { ...video!, durationSeconds: 14 }];
    const parsed = parseMediaSet(serializeMediaSet(set, '/shows/Sponsors.pictaset', 'posix'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resolved = resolveMediaSetPaths(parsed.value, '/shows/Sponsors.pictaset', 'posix');
    expect(resolved.items.map((item) => item.id)).toEqual(['image-1', 'video-1']);
    expect(resolved.items[1]?.durationSeconds).toBe(14);
    expect(
      parseMediaSet(
        JSON.stringify({
          version: 1,
          name: 'Bad',
          items: [{ id: 'x', type: 'video', path: 'bad.mov' }],
        }),
      ).ok,
    ).toBe(false);
  });
});

describe('picta v2 and v1 migration', () => {
  it('round-trips inline media, event state and a zone layout', () => {
    const media = defaultMediaSet('Inline');
    media.items = [{ id: 'media-1', type: 'image', path: '/shows/a.png' }];
    const show = {
      version: 2 as const,
      media: { kind: 'inline' as const, data: media },
      event: { stats: { p1: { points: 3 } }, liveGroups: { starters: ['p1'] } },
      layout: HALF_HALF_LAYOUT,
      liveBoardGroupId: 'starters',
      background: { kind: 'black' as const },
    };
    const parsed = parsePictaV2(serializePictaV2(show, '/shows/Game.picta', 'posix'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.event.stats.p1?.points).toBe(3);
    expect(parsed.value.layout.type).toBe('split');
  });

  it('validates inline event references against the team', () => {
    const team = createTeam('Wildcats', 'volleyball');
    const show = {
      version: 2 as const,
      media: { kind: 'inline' as const, data: defaultMediaSet('Inline') },
      team: { kind: 'inline' as const, data: team },
      event: { stats: { missing: { kills: 1 } }, liveGroups: {} },
      layout: HALF_HALF_LAYOUT,
      background: { kind: 'black' as const },
    };
    const parsed = parsePictaV2(serializePictaV2(show, '/shows/Game.picta', 'posix'));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.kind).toBe('invalid-event');
  });

  it('migrates v1 images, roster stats and on-court state in memory', () => {
    const migrated = migratePictaV1({
      version: 1,
      storedPaths: ['Images/a.png'],
      intervalSeconds: 10,
      transition: 'crossfade',
      imageSizing: 'fit',
      layout: 'split',
      roster: [
        {
          id: 'runtime',
          number: '7',
          name: 'Avery',
          position: 'OH',
          stats: { kills: 4, assists: 0, digs: 2, blocks: 0 },
          onCourt: true,
        },
      ],
    });
    expect(migrated.version).toBe(2);
    expect(migrated.media.kind).toBe('inline');
    expect(migrated.media.data?.imageDurationSeconds).toBe(10);
    expect(migrated.media.data?.transition).toBe('crossfade');
    expect(migrated.team?.kind).toBe('inline');
    expect(migrated.event.liveGroups['on-court']).toHaveLength(1);
    expect(migrated.event.stats['player-v1-1']?.blockSolos).toBe(0);
    expect(migrated.layout.type).toBe('split');
  });
});
