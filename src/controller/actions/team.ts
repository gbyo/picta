/** Roster, groups and team identity. Team edits are allowed while live. */

import type { MediaRef, Player, PlayerGroup, Team } from '@core/domain.js';
import { isSupportedImagePath, isSupportedVideoPath } from '@core/media.js';
import { basename, resolvePath } from '@core/paths.js';
import { parseRosterText } from '@core/roster-import.js';
import { makeCustomSport } from '@core/sports.js';
import {
  addGroup,
  addPlayer,
  addPlayerToGroup,
  makeGroup,
  makePlayer,
  removeGroup,
  removePlayer as removePlayerFromTeam,
  removePlayerFromGroup,
  reorderGroupPlayer,
  updatePlayer,
} from '@core/teams.js';
import { rt } from '../runtime.js';
import { ask } from '../state/dialogs.js';
import { definitionOf, teamOf } from '../state/derive.js';
import { getState, setState } from '../state/store.js';
import { setTeam } from './edit.js';
import { notify } from './notify.js';

function team(): Team | undefined {
  return teamOf(getState().doc.show.data);
}

function edit(update: (team: Team) => Team): void {
  const current = team();
  if (!current) return;
  const next = update(current);
  if (next !== current) setTeam(next);
}

export function renameTeam(name: string): void {
  const value = name.trim();
  if (!value) return;
  edit((current) => (current.name === value ? current : { ...current, name: value }));
}

export function setTeamColor(which: 'primary' | 'secondary', color: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  edit((current) =>
    current.colors[which] === color
      ? current
      : { ...current, colors: { ...current.colors, [which]: color } },
  );
}

export function addRosterPlayer(number: string, name: string, position: string): string | null {
  const current = team();
  if (!current || !name.trim()) return null;
  const player = makePlayer(number, name, position);
  setTeam(addPlayer(current, player));
  return player.id;
}

export function importRoster(text: string): number {
  const current = team();
  if (!current) return 0;
  const definition = definitionOf(current);
  const { players } = parseRosterText(text, definition?.positions ?? []);
  if (players.length === 0) return 0;
  let next = current;
  const added: string[] = [];
  for (const imported of players) {
    const player = makePlayer(imported.number, imported.name, imported.position);
    added.push(player.id);
    next = addPlayer(next, player);
  }
  setTeam(next);
  notify.undoable(`Added ${players.length} player${players.length === 1 ? '' : 's'}`, {
    // Remove only the imported players, keeping any edits made since.
    run: () => {
      let latest = team();
      if (!latest || latest.id !== current.id) return;
      for (const id of added) latest = removePlayerFromTeam(latest, id);
      setTeam(latest);
    },
  });
  return players.length;
}

export function editPlayer(
  playerId: string,
  update: Partial<Pick<Player, 'number' | 'name' | 'position'>>,
): void {
  edit((current) => {
    const player = current.players.find((item) => item.id === playerId);
    if (!player) return current;
    const next: Player = { ...player };
    if (update.number !== undefined) next.number = update.number.trim();
    if (update.name !== undefined) {
      const name = update.name.trim();
      if (!name) return current;
      next.name = name;
    }
    if (update.position !== undefined) {
      const position = update.position.trim();
      if (position) next.position = position;
      else delete next.position;
    }
    if (
      next.number === player.number &&
      next.name === player.name &&
      next.position === player.position
    )
      return current;
    return updatePlayer(current, next);
  });
}

export function removePlayer(playerId: string): void {
  const before = team();
  const index = before?.players.findIndex((item) => item.id === playerId) ?? -1;
  const player = before?.players[index];
  if (!before || !player) return;
  const event = getState().doc.show.data.event;
  const stats = event.stats[playerId];
  const groupPlaces = before.groups.flatMap((group) => {
    const at = group.playerIds.indexOf(playerId);
    return at >= 0 ? [{ groupId: group.id, at }] : [];
  });
  const livePlaces = Object.entries(event.liveGroups).flatMap(([groupId, ids]) => {
    const at = ids.indexOf(playerId);
    return at >= 0 ? [{ groupId, at }] : [];
  });
  setTeam(removePlayerFromTeam(before, playerId));
  notify.undoable(`Removed ${player.number ? `#${player.number} ` : ''}${player.name}`, {
    // Restore just this player: their roster place, groups, counters and
    // tonight's live places. Nothing else that changed since is touched.
    run: () => {
      const latest = team();
      if (!latest || latest.id !== before.id || latest.players.some((item) => item.id === playerId))
        return;
      const players = latest.players.slice();
      players.splice(Math.min(index, players.length), 0, player);
      const groups = latest.groups.map((group) => {
        const place = groupPlaces.find((item) => item.groupId === group.id);
        if (!place) return group;
        const ids = group.playerIds.slice();
        ids.splice(Math.min(place.at, ids.length), 0, playerId);
        return { ...group, playerIds: ids };
      });
      setTeam({ ...latest, players, groups });
      setState((state) => {
        const data = state.doc.show.data;
        const liveGroups = { ...data.event.liveGroups };
        for (const place of livePlaces) {
          const ids = (liveGroups[place.groupId] ?? []).slice();
          if (!ids.includes(playerId)) ids.splice(Math.min(place.at, ids.length), 0, playerId);
          liveGroups[place.groupId] = ids;
        }
        return {
          doc: {
            ...state.doc,
            show: {
              ...state.doc.show,
              data: {
                ...data,
                event: {
                  ...data.event,
                  stats: stats ? { ...data.event.stats, [playerId]: stats } : data.event.stats,
                  liveGroups,
                },
              },
            },
          },
        };
      });
    },
  });
}

export function moveRosterPlayer(playerId: string, overId: string): void {
  edit((current) => {
    const from = current.players.findIndex((item) => item.id === playerId);
    const to = current.players.findIndex((item) => item.id === overId);
    if (from < 0 || to < 0 || from === to) return current;
    const players = current.players.slice();
    const [moved] = players.splice(from, 1);
    players.splice(to, 0, moved!);
    return { ...current, players };
  });
}

export function nudgeRosterPlayer(playerId: string, delta: number): void {
  const current = team();
  if (!current) return;
  const from = current.players.findIndex((item) => item.id === playerId);
  const to = Math.max(0, Math.min(current.players.length - 1, from + delta));
  const over = current.players[to];
  if (from >= 0 && over) moveRosterPlayer(playerId, over.id);
}

export async function choosePlayerMedia(
  playerId: string,
  kind: 'photo' | 'introVideo',
): Promise<void> {
  const { platform } = rt();
  const picked = await platform.dialogs.chooseMedia(getState().prefs.lastDirectory);
  const path = picked.find((item) =>
    kind === 'photo' ? isSupportedImagePath(item) : isSupportedVideoPath(item),
  );
  if (!path) {
    if (picked.length > 0)
      notify.warning(
        kind === 'photo' ? 'Choose a PNG, JPEG or WebP photo.' : 'Choose an MP4 or WebM video.',
      );
    return;
  }
  await platform.files.allowMedia([path]).catch(() => undefined);
  setPlayerMedia(playerId, kind, { path });
}

export function setPlayerMedia(
  playerId: string,
  kind: 'photo' | 'introVideo',
  ref: MediaRef | null,
): void {
  edit((current) => {
    const player = current.players.find((item) => item.id === playerId);
    if (!player) return current;
    const media = { ...player.media };
    if (ref) media[kind] = ref;
    else delete media[kind];
    return updatePlayer(current, { ...player, media });
  });
}

export function toggleFeaturedStat(playerId: string, statId: string): void {
  edit((current) => {
    const player = current.players.find((item) => item.id === playerId);
    const definition = definitionOf(current);
    if (!player || !definition) return current;
    const selected = player.featuredStats ?? definition.defaultFeaturedStats;
    const next = selected.includes(statId)
      ? selected.filter((id) => id !== statId)
      : [...selected, statId].slice(-4);
    return updatePlayer(current, { ...player, featuredStats: next });
  });
}

export function resetFeaturedStats(playerId: string): void {
  edit((current) => {
    const player = current.players.find((item) => item.id === playerId);
    if (!player || player.featuredStats === undefined) return current;
    const { featuredStats: _removed, ...rest } = player;
    return updatePlayer(current, rest);
  });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroup(): Promise<void> {
  const current = team();
  if (!current) return;
  const name = await ask.text({
    title: 'New group',
    label: 'Group name',
    placeholder: 'e.g. Senior Night',
    confirmLabel: 'Create Group',
    validate: (value) =>
      current.groups.some((group) => group.name.toLocaleLowerCase() === value.toLocaleLowerCase())
        ? 'This team already has a group with that name.'
        : null,
  });
  if (!name) return;
  const group = makeGroup(name);
  setTeam(addGroup(team() ?? current, group));
  setState({ selectedGroupId: group.id });
}

export async function renameGroup(groupId: string): Promise<void> {
  const current = team();
  const group = current?.groups.find((item) => item.id === groupId);
  if (!current || !group) return;
  const name = await ask.text({
    title: 'Rename group',
    label: 'Group name',
    initialValue: group.name,
    confirmLabel: 'Rename',
    validate: (value) =>
      current.groups.some(
        (item) =>
          item.id !== groupId && item.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
      )
        ? 'This team already has a group with that name.'
        : null,
  });
  if (!name) return;
  edit((latest) => ({
    ...latest,
    groups: latest.groups.map((item) => (item.id === groupId ? { ...item, name } : item)),
  }));
}

export function deleteGroup(groupId: string): void {
  const before = team();
  const group = before?.groups.find((item) => item.id === groupId);
  if (!before || !group) return;
  const index = before.groups.findIndex((item) => item.id === groupId);
  setTeam(removeGroup(before, groupId));
  notify.undoable(`Removed the group ${group.name}. Players stay on the roster.`, {
    run: () => {
      const latest = team();
      if (!latest || latest.id !== before.id || latest.groups.some((item) => item.id === groupId))
        return;
      const present = new Set(latest.players.map((player) => player.id));
      const groups = latest.groups.slice();
      groups.splice(index, 0, {
        ...group,
        playerIds: group.playerIds.filter((id) => present.has(id)),
      });
      setTeam({ ...latest, groups });
      setState({ selectedGroupId: groupId });
    },
  });
}

export function setGroupMax(groupId: string, max: number | null): void {
  edit((current) => ({
    ...current,
    groups: current.groups.map((group): PlayerGroup => {
      if (group.id !== groupId) return group;
      if (max === null || !Number.isFinite(max) || max < 1) {
        const { maxPlayers: _removed, ...rest } = group;
        return rest;
      }
      return {
        ...group,
        maxPlayers: Math.round(max),
        playerIds: group.playerIds.slice(0, Math.round(max)),
      };
    }),
  }));
}

export function addToGroup(groupId: string, playerId: string): boolean {
  const current = team();
  const group = current?.groups.find((item) => item.id === groupId);
  if (!current || !group) return false;
  if (group.maxPlayers !== undefined && group.playerIds.length >= group.maxPlayers) {
    notify.warning(`${group.name} already has ${group.maxPlayers} players.`);
    return false;
  }
  setTeam(addPlayerToGroup(current, groupId, playerId));
  return true;
}

export function removeFromGroup(groupId: string, playerId: string): void {
  edit((current) => removePlayerFromGroup(current, groupId, playerId));
}

export function moveInGroup(groupId: string, playerId: string, overId: string): void {
  edit((current) => {
    const group = current.groups.find((item) => item.id === groupId);
    if (!group) return current;
    const from = group.playerIds.indexOf(playerId);
    const to = group.playerIds.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return current;
    return reorderGroupPlayer(current, groupId, from, to);
  });
}

export function nudgeInGroup(groupId: string, playerId: string, delta: number): void {
  edit((current) => {
    const group = current.groups.find((item) => item.id === groupId);
    if (!group) return current;
    const from = group.playerIds.indexOf(playerId);
    if (from < 0) return current;
    return reorderGroupPlayer(current, groupId, from, from + delta);
  });
}

// ---------------------------------------------------------------------------
// Custom sport statistics
// ---------------------------------------------------------------------------

export function setCustomStats(stats: { id: string; label: string; shortLabel: string }[]): void {
  edit((current) => {
    const custom = current.customSport;
    if (current.sport !== 'custom' || !custom) return current;
    return { ...current, customSport: makeCustomSport(custom.name, stats, custom.positions) };
  });
}

// ---------------------------------------------------------------------------
// Missing team media
// ---------------------------------------------------------------------------

export async function locateMissingTeamMedia(): Promise<void> {
  const current = team();
  if (!current) return;
  const { platform } = rt();
  const style = getState().pathStyle;
  const missing = current.players.flatMap((player) =>
    (['photo', 'introVideo'] as const)
      .filter((kind) => player.media[kind]?.missing)
      .map((kind) => ({ playerId: player.id, kind, path: player.media[kind]!.path })),
  );
  if (missing.length === 0) {
    notify.info('No team media is missing.');
    return;
  }
  const folder = await platform.dialogs.chooseFolder(
    getState().prefs.lastDirectory,
    'Locate Moved Team Media',
  );
  if (!folder) return;
  const candidates = missing.map((item) => resolvePath(folder, basename(item.path, style), style));
  const exists = await platform.files
    .pathsExist(candidates)
    .catch(() => candidates.map(() => false));
  const replacements = new Map<string, string>();
  missing.forEach((item, index) => {
    if (exists[index]) replacements.set(`${item.playerId}:${item.kind}`, candidates[index]!);
  });
  if (replacements.size === 0) {
    notify.warning('None of the missing team media was in that folder.');
    return;
  }
  await platform.files.allowMedia([...replacements.values()]).catch(() => undefined);
  edit((latest) => ({
    ...latest,
    players: latest.players.map((player) => {
      const media = { ...player.media };
      for (const kind of ['photo', 'introVideo'] as const) {
        const path = replacements.get(`${player.id}:${kind}`);
        if (path) media[kind] = { path };
      }
      return { ...player, media };
    }),
  }));
  notify.success(
    `Relinked ${replacements.size} team media file${replacements.size === 1 ? '' : 's'}.`,
  );
}

export function selectPlayer(playerId: string | null): void {
  setState({ selectedPlayerId: playerId });
}

export function selectGroup(groupId: string | null): void {
  setState({ selectedGroupId: groupId });
}
