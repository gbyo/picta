import { describe, expect, it } from 'vitest';
import {
  beginManualGroup,
  cancelManualPlayer,
  finishManualPlayer,
  manualPlayerSelectable,
  manualShownCount,
  startManualPlayer,
  undoManualPlayer,
} from '../src/core/manual-group.js';
import {
  layoutPreset,
  resolveZoneRects,
  safeAreaForRect,
  splitZone,
  zoneIdForRole,
  SAFE_AREA_INSET,
} from '../src/core/layouts.js';
import {
  beginZoneEdit,
  cancelZoneEdit,
  commitZoneEdit,
  selectEditZone,
  setDraftLayout,
  zoneEditChanged,
} from '../src/core/zone-edit.js';
import {
  addScene,
  defaultSceneSet,
  makeScene,
  moveScene,
  removeScene,
  setDefaultScene,
  validateScenes,
} from '../src/core/scenes.js';
import { cuesForPlayers, playerCue } from '../src/core/player-cues.js';
import { presentPlayer, type PresentationOutcome } from '../src/core/player-presentation.js';
import type { Cue, LayoutNode, Team } from '../src/core/domain.js';

const team: Team = {
  version: 1,
  id: 'team',
  name: 'Team',
  sport: 'basketball',
  colors: { primary: '#111111', secondary: '#ffffff' },
  players: [
    { id: 'p1', number: '1', name: 'One', media: {} },
    { id: 'p2', number: '2', name: 'Two', media: { introVideo: { path: '/two.mp4' } } },
    {
      id: 'p3',
      number: '3',
      name: 'Three',
      media: { introVideo: { path: '/x.mp4', missing: true } },
    },
  ],
  groups: [],
};
const event = { stats: {}, liveGroups: {} };
const player = (id: string) => team.players.find((item) => item.id === id)!;

/** Play stub that reports a scripted outcome per cue type. */
function playerWith(outcomes: Partial<Record<Cue['type'], PresentationOutcome>>) {
  const seen: Cue['type'][] = [];
  return {
    seen,
    deps: {
      play: async (cue: Cue) => {
        seen.push(cue.type);
        return (outcomes[cue.type] ?? 'played') as 'played' | 'failed' | 'cancelled';
      },
    },
  };
}

describe('player cue intent', () => {
  it('preferred prefers a usable video and falls back to the card', () => {
    expect(playerCue(player('p2'), team, event, { mode: 'preferred' })?.type).toBe('video');
    expect(playerCue(player('p1'), team, event, { mode: 'preferred' })?.type).toBe('player-card');
    // A video Picta knows is missing is not a usable video.
    expect(playerCue(player('p3'), team, event, { mode: 'preferred' })?.type).toBe('player-card');
  });

  it('card never becomes video and video never becomes card', () => {
    expect(playerCue(player('p2'), team, event, { mode: 'card' })?.type).toBe('player-card');
    expect(playerCue(player('p2'), team, event, { mode: 'video' })?.type).toBe('video');
    expect(playerCue(player('p1'), team, event, { mode: 'video' })).toBeNull();
    expect(playerCue(player('p3'), team, event, { mode: 'video' })).toBeNull();
  });

  it('keeps card building and stats in one place for every path', () => {
    const ordered = cuesForPlayers(['p1', 'p2'], team, event);
    expect(ordered.map((cue) => cue.type)).toEqual(['player-card', 'video']);
    expect(ordered[0]).toEqual(playerCue(player('p1'), team, event, { mode: 'preferred' }));
    expect(ordered[0]).toEqual(playerCue(player('p1'), team, event, { mode: 'card' }));
  });

  it('honours the requested target', () => {
    expect(
      playerCue(player('p2'), team, event, { mode: 'video', target: 'full-board' })?.target,
    ).toBe('full-board');
    expect(cuesForPlayers(['p1'], team, event, 'full-board')[0]?.target).toBe('full-board');
  });
});

describe('single player presentation outcomes', () => {
  it('reports an explicit video as unavailable rather than showing a card', async () => {
    const { seen, deps } = playerWith({});
    const report = await presentPlayer(player('p1'), team, event, { mode: 'video' }, deps);
    expect(report.outcome).toBe('unavailable');
    expect(seen).toEqual([]);
  });

  it('does not fall back to a card when an explicit video fails', async () => {
    const { seen, deps } = playerWith({ video: 'failed' });
    const report = await presentPlayer(player('p2'), team, event, { mode: 'video' }, deps);
    expect(report.outcome).toBe('failed');
    expect(report.usedCardFallback).toBe(false);
    expect(seen).toEqual(['video']);
  });

  it('falls back from a failed preferred video to the card', async () => {
    const { seen, deps } = playerWith({ video: 'failed' });
    const report = await presentPlayer(player('p2'), team, event, { mode: 'preferred' }, deps);
    expect(seen).toEqual(['video', 'player-card']);
    expect(report.outcome).toBe('played');
    expect(report.usedCardFallback).toBe(true);
  });

  it('stays unplayed when the fallback card also fails', async () => {
    const { deps } = playerWith({ video: 'failed', 'player-card': 'failed' });
    const report = await presentPlayer(player('p2'), team, event, { mode: 'preferred' }, deps);
    expect(report.outcome).toBe('failed');
    expect(report.playedCue).toBeNull();
  });

  it('treats a cancellation as the operator’s decision, not a video failure', async () => {
    const { seen, deps } = playerWith({ video: 'cancelled' });
    const report = await presentPlayer(player('p2'), team, event, { mode: 'preferred' }, deps);
    expect(report.outcome).toBe('cancelled');
    expect(seen).toEqual(['video']);
  });
});

describe('manual lineup sessions', () => {
  it('marks a player shown only after a successful presentation', () => {
    let session = beginManualGroup('starters', ['p1', 'p2', 'p3']);
    session = finishManualPlayer(startManualPlayer(session, 'p1'), 'failed');
    expect(session.shownPlayerIds).toEqual([]);
    session = finishManualPlayer(startManualPlayer(session, 'p1'), 'cancelled');
    expect(session.shownPlayerIds).toEqual([]);
    session = finishManualPlayer(startManualPlayer(session, 'p1'), 'played');
    expect(session.shownPlayerIds).toEqual(['p1']);
    expect(session.currentPlayerId).toBeNull();
  });

  it('lets a shown player be replayed without changing the count or history', () => {
    let session = beginManualGroup('starters', ['p1', 'p2', 'p3']);
    session = finishManualPlayer(startManualPlayer(session, 'p1'), 'played');
    session = finishManualPlayer(startManualPlayer(session, 'p2'), 'played');
    expect(manualShownCount(session)).toBe(2);

    expect(manualPlayerSelectable(session, 'p1')).toBe(true);
    const replaying = startManualPlayer(session, 'p1');
    expect(replaying.currentIsReplay).toBe(true);
    const replayed = finishManualPlayer(replaying, 'played');
    expect(replayed.shownPlayerIds).toEqual(['p1', 'p2']);
    expect(manualShownCount(replayed)).toBe(2);

    // Undo still walks back first presentations, newest first.
    expect(undoManualPlayer(replayed).shownPlayerIds).toEqual(['p1']);
  });

  it('refuses a second player while one is playing, and cancels cleanly', () => {
    let session = beginManualGroup('starters', ['p1', 'p2']);
    session = startManualPlayer(session, 'p1');
    expect(manualPlayerSelectable(session, 'p2')).toBe(false);
    expect(startManualPlayer(session, 'p2')).toBe(session);
    session = cancelManualPlayer(session);
    expect(session.currentPlayerId).toBeNull();
    expect(session.shownPlayerIds).toEqual([]);
  });

  it('presents out of order without touching the saved group', () => {
    const playerIds = ['p1', 'p2', 'p3'];
    let session = beginManualGroup('starters', playerIds);
    session = finishManualPlayer(startManualPlayer(session, 'p3'), 'played');
    session = finishManualPlayer(startManualPlayer(session, 'p1'), 'played');
    // Presentation order is history; the group's own order never moves.
    expect(session.shownPlayerIds).toEqual(['p3', 'p1']);
    expect(session.playerIds).toEqual(['p1', 'p2', 'p3']);
    expect(playerIds).toEqual(['p1', 'p2', 'p3']);
  });
});

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

  it('reorders scenes without disturbing the default', () => {
    let set = defaultSceneSet();
    set = addScene(set, makeScene('Full Board', layoutPreset('full'), 'full-board'));
    set = addScene(set, makeScene('Stats', layoutPreset('half-half'), 'stats'));
    set = setDefaultScene(set, 'stats');
    const names = (value: typeof set) => value.scenes.map((scene) => scene.id);
    expect(names(set)).toEqual(['scene-1', 'full-board', 'stats']);

    const moved = moveScene(set, 'stats', -1);
    expect(names(moved)).toEqual(['scene-1', 'stats', 'full-board']);
    expect(moved.defaultSceneId).toBe('stats');
    // The original set is untouched, and the saved order is the button order.
    expect(names(set)).toEqual(['scene-1', 'full-board', 'stats']);

    expect(names(moveScene(moved, 'scene-1', -1))).toEqual(names(moved));
    expect(names(moveScene(moved, 'full-board', 1))).toEqual(names(moved));
    expect(names(moveScene(moved, 'missing', 1))).toEqual(names(moved));
    expect(moveScene(moved, 'scene-1', 2).scenes.map((scene) => scene.id)).toEqual([
      'stats',
      'full-board',
      'scene-1',
    ]);
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

  it('applies a preset to the draft only, so Cancel restores the original', () => {
    const scene = makeScene('Game', layoutPreset('full'), 'game');
    const edit = setDraftLayout(beginZoneEdit(scene), layoutPreset('half-half'));
    expect(edit.draft.layout).toEqual(layoutPreset('half-half'));
    expect(edit.original.layout).toEqual(layoutPreset('full'));
    expect(cancelZoneEdit(edit)).toEqual(scene);
    expect(commitZoneEdit(edit).layout).toEqual(layoutPreset('half-half'));
  });

  it('keeps the selected zone valid across splits and merges', () => {
    const scene = makeScene('Game', layoutPreset('half-half'), 'game');
    let edit = selectEditZone(beginZoneEdit(scene), 'live-board');
    edit = setDraftLayout(edit, splitZone(edit.draft.layout, 'live-board', 'rows', 'blank'));
    expect(edit.selectedZoneId).toBe('live-board');
    // Removing the selected zone must not leave a dangling selection.
    edit = setDraftLayout(edit, layoutPreset('full'));
    expect(edit.selectedZoneId).toBe('program');
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

describe('per-zone safe areas', () => {
  it('insets each zone by its own dimensions on a tiled wall', () => {
    const safe = resolveZoneRects(layoutPreset('half-half'), 3840, 1080).map((rect) =>
      safeAreaForRect(rect),
    );
    expect(safe).toHaveLength(2);
    const [program, board] = safe;
    // Each half is 1920 x 1080 and gets its own 4.5% inset.
    expect(program?.x).toBeCloseTo(1920 * SAFE_AREA_INSET);
    expect(program?.width).toBeCloseTo(1920 * (1 - SAFE_AREA_INSET * 2));
    expect(board?.x).toBeCloseTo(1920 + 1920 * SAFE_AREA_INSET);
    expect(board?.width).toBeCloseTo(program?.width ?? 0);
    expect(program?.height).toBeCloseTo(1080 * (1 - SAFE_AREA_INSET * 2));
  });

  it('resizes zone-local safe areas with an uneven split', () => {
    const layout: LayoutNode = {
      type: 'split',
      direction: 'columns',
      ratio: 0.65,
      first: { type: 'zone', id: 'program', role: 'program' },
      second: { type: 'zone', id: 'live-board', role: 'live-board' },
    };
    const rects = resolveZoneRects(layout, 3840, 1080);
    expect(rects.map((rect) => rect.width)).toEqual([2496, 1344]);
    const safe = rects.map((rect) => safeAreaForRect(rect));
    expect(safe[0]?.width).toBeCloseTo(2496 * (1 - SAFE_AREA_INSET * 2));
    expect(safe[1]?.width).toBeCloseTo(1344 * (1 - SAFE_AREA_INSET * 2));
    expect(safe[1]?.x).toBeCloseTo(2496 + 1344 * SAFE_AREA_INSET);
  });
});
