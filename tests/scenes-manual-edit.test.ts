import { describe, expect, it } from 'vitest';
import {
  beginManualGroup,
  completeManualPlayer,
  endManualGroup,
  replayManualGroup,
  startManualPlayer,
  undoManualPlayer,
} from '../src/core/manual-group.js';
import { layoutPreset, zoneIdForRole } from '../src/core/layouts.js';
import {
  beginZoneEdit,
  cancelZoneEdit,
  commitZoneEdit,
  setDraftLayout,
  zoneEditChanged,
} from '../src/core/zone-edit.js';
import {
  addScene,
  defaultSceneSet,
  makeScene,
  removeScene,
  setDefaultScene,
  validateScenes,
} from '../src/core/scenes.js';
import { splitZone } from '../src/core/layouts.js';
import { cueForPlayer, cuesForPlayers } from '../src/core/player-cues.js';

describe('scenes', () => {
  it('validates unique ids/names, the default, layouts and group references', () => {
    const first = {
      ...makeScene('Game', layoutPreset('full'), 'game'),
      liveBoardGroupId: 'starters',
    };
    expect(
      validateScenes([first], 'game', {
        groups: [{ id: 'starters', name: 'Starters', playerIds: [] }],
      } as never).ok,
    ).toBe(true);
    expect(
      validateScenes([first, { ...makeScene('game', layoutPreset('full'), 'other') }], 'game').ok,
    ).toBe(false);
    expect(validateScenes([first], 'missing').ok).toBe(false);
    expect(
      validateScenes([{ ...first, liveBoardGroupId: 'missing' }], 'game', { groups: [] } as never)
        .ok,
    ).toBe(false);
  });

  it('supports immutable add/default/delete scene operations', () => {
    const set = defaultSceneSet();
    const second = makeScene('Alternate', layoutPreset('half-half'), 'alternate');
    const added = addScene(set, second);
    expect(added.scenes).toHaveLength(2);
    const defaulted = setDefaultScene(added, 'alternate');
    expect(defaulted.defaultSceneId).toBe('alternate');
    const removed = removeScene(defaulted, 'alternate');
    expect(removed?.defaultSceneId).toBe(set.defaultSceneId);
    expect(set.scenes).toHaveLength(1);
  });
});

describe('manual group sessions', () => {
  it('tracks shown players, undo, end and replay without mutating team data', () => {
    let session = beginManualGroup('starters', ['p1', 'p2']);
    session = startManualPlayer(session, 'p1');
    session = completeManualPlayer(session);
    expect(session.shownPlayerIds).toEqual(['p1']);
    expect(startManualPlayer(session, 'p1')).toEqual(session);
    session = undoManualPlayer(session);
    expect(session.shownPlayerIds).toEqual([]);
    session = startManualPlayer(session, 'p2');
    session = completeManualPlayer(session);
    session = endManualGroup(session);
    expect(session.ended).toBe(true);
    expect(replayManualGroup(session)).toEqual(beginManualGroup('starters', ['p1', 'p2']));
  });
});

describe('canonical player cues', () => {
  it('uses the same video-or-card fallback for ordered and individual paths', () => {
    const team = {
      version: 1 as const,
      id: 'team',
      name: 'Team',
      sport: 'basketball',
      colors: { primary: '#111111', secondary: '#ffffff' },
      players: [
        { id: 'p1', number: '1', name: 'One', media: {} },
        { id: 'p2', number: '2', name: 'Two', media: { introVideo: { path: '/two.mp4' } } },
      ],
      groups: [],
    };
    const event = { stats: {}, liveGroups: {} };
    const individual = cueForPlayer(team.players[0]!, team, event);
    const ordered = cuesForPlayers(['p1', 'p2'], team, event);
    expect(individual?.type).toBe('player-card');
    expect(ordered.map((cue) => cue.type)).toEqual(['player-card', 'video']);
    expect(ordered[0]).toEqual(individual);
  });
});

describe('zone edit drafts and role routing', () => {
  it('keeps cancel runtime-only and commits only the draft', () => {
    const scene = makeScene('Game', layoutPreset('full'), 'game');
    let edit = beginZoneEdit(scene);
    edit = setDraftLayout(
      edit,
      splitZone(edit.draft.layout, 'program', 'columns', 'live-board', 'board-screen'),
    );
    expect(zoneEditChanged(edit)).toBe(true);
    expect(cancelZoneEdit(edit)).toEqual(scene);
    expect(commitZoneEdit(edit).layout.type).toBe('split');
  });

  it('routes by role even when ids are not legacy literals', () => {
    const layout = {
      type: 'split' as const,
      direction: 'columns' as const,
      ratio: 0.6,
      first: { type: 'zone' as const, id: 'main-screen', role: 'program' as const },
      second: { type: 'zone' as const, id: 'stats-screen', role: 'live-board' as const },
    };
    expect(zoneIdForRole(layout, 'program')).toBe('main-screen');
    expect(zoneIdForRole(layout, 'live-board')).toBe('stats-screen');
  });
});
