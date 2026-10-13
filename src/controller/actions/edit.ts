/**
 * The only way document data changes.
 *
 * Each edit names what it touched — the show itself, its media set, its team
 * or tonight's event — so dirty tracking matches the files that will actually
 * be written: editing a linked `.pictaset` dirties that file, not the show.
 */

import type { EventState, MediaSet, Screen, ShowDocument, Team } from '@core/domain.js';
import { defaultVolleyballScore } from '@core/score.js';
import { pruneStatLog } from '@core/stat-log.js';
import { getState, setState } from '../state/store.js';
import { mediaSetOf } from '../state/derive.js';

type Touch = 'show' | 'media' | 'team';

function dirtyFlags(data: ShowDocument, touched: readonly Touch[]) {
  const state = getState().doc;
  let showDirty = state.show.dirty;
  let mediaDirty = state.mediaDirty;
  let teamDirty = state.teamDirty;
  for (const kind of touched) {
    if (kind === 'show') showDirty = true;
    if (kind === 'media') {
      mediaDirty = true;
      if (data.media.kind === 'inline') showDirty = true;
    }
    if (kind === 'team') {
      teamDirty = true;
      if (data.team?.kind !== 'file') showDirty = true;
    }
  }
  return { showDirty, mediaDirty, teamDirty };
}

export function commitShowData(data: ShowDocument, touched: readonly Touch[]): void {
  const flags = dirtyFlags(data, touched);
  setState((state) => ({
    doc: {
      ...state.doc,
      show: { ...state.doc.show, data, dirty: flags.showDirty },
      mediaDirty: flags.mediaDirty,
      teamDirty: flags.teamDirty,
    },
  }));
}

export function updateShow(
  update: (data: ShowDocument) => ShowDocument,
  touched: readonly Touch[],
): void {
  const before = getState().doc.show.data;
  const after = update(before);
  if (after === before) return;
  commitShowData(after, touched);
}

export function setMediaSet(set: MediaSet): void {
  updateShow((data) => ({ ...data, media: { ...data.media, data: set } }), ['media']);
}

export function currentMediaSet(): MediaSet {
  const state = getState();
  return mediaSetOf(state.doc.show.data, state.pathStyle);
}

/** Keep event state and Screens consistent with an edited team. */
export function reconcileForTeam(data: ShowDocument, team: Team): ShowDocument {
  const playerIds = new Set(team.players.map((player) => player.id));
  const groups = new Map(team.groups.map((group) => [group.id, group]));
  const stats = Object.fromEntries(
    Object.entries(data.event.stats).filter(([playerId]) => playerIds.has(playerId)),
  );
  const liveGroups: Record<string, string[]> = {};
  for (const [groupId, ids] of Object.entries(data.event.liveGroups)) {
    const group = groups.get(groupId);
    if (!group) continue;
    const filtered = ids.filter((id) => playerIds.has(id));
    liveGroups[groupId] =
      group.maxPlayers === undefined ? filtered : filtered.slice(0, group.maxPlayers);
  }
  const event: EventState = {
    stats,
    liveGroups,
    score: data.event.score ?? defaultVolleyballScore(team),
  };
  let screensChanged = false;
  const screens: Screen[] = data.screens.map((screen) => {
    let changed = false;
    const panels = screen.panels.map((panel) => {
      if (
        panel.content.kind === 'stats' &&
        panel.content.groupId &&
        !groups.has(panel.content.groupId)
      ) {
        changed = true;
        return { ...panel, content: { kind: 'stats' as const } };
      }
      return panel;
    });
    if (!changed) return screen;
    screensChanged = true;
    return { ...screen, panels };
  });
  return { ...data, event, ...(screensChanged ? { screens } : {}) };
}

export function setTeam(team: Team): void {
  updateShow(
    (data) => {
      const resource = data.team;
      const withTeam: ShowDocument = {
        ...data,
        team: resource ? { ...resource, data: team } : { kind: 'inline', data: team },
      };
      return reconcileForTeam(withTeam, team);
    },
    ['team'],
  );
  const ids = new Set(team.players.map((player) => player.id));
  setState((state) => ({
    statLog: pruneStatLog(state.statLog, ids),
    selectedPlayerId:
      state.selectedPlayerId && ids.has(state.selectedPlayerId) ? state.selectedPlayerId : null,
    selectedGroupId:
      state.selectedGroupId && team.groups.some((group) => group.id === state.selectedGroupId)
        ? state.selectedGroupId
        : (team.groups[0]?.id ?? null),
  }));
}

export function setEvent(update: (event: EventState) => EventState): void {
  updateShow(
    (data) => {
      const event = update(data.event);
      return event === data.event ? data : { ...data, event };
    },
    ['show'],
  );
}

export function setScreens(screens: Screen[], defaultScreenId?: string): void {
  updateShow(
    (data) => ({
      ...data,
      screens,
      defaultScreenId:
        defaultScreenId && screens.some((screen) => screen.id === defaultScreenId)
          ? defaultScreenId
          : screens.some((screen) => screen.id === data.defaultScreenId)
            ? data.defaultScreenId
            : screens[0]!.id,
    }),
    ['show'],
  );
}
